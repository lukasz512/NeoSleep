import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { AppError, DocumentRenderError } from "../errors.js";

/**
 * Single seam for HTML→PDF rendering. Every document generator in the
 * codebase (GDPR consent, collaboration agreement, patient informed
 * consent) must call only renderHtmlToPdf() and never touch
 * Puppeteer/Chromium directly — see
 * docs/stories/partner-registration-legal-documents.md. Keeping this the
 * one seam means the rendering approach stays swappable (e.g. to an
 * external rendering service) without touching any caller, if Render's
 * hosting turns out not to support headless Chrome reliably.
 *
 * Uses puppeteer-core + @sparticuz/chromium rather than full `puppeteer`:
 * the Chromium binary ships compressed inside the npm package itself, so
 * there's no postinstall download step — pnpm 9 blocks arbitrary
 * postinstall scripts by default and this repo has no approve-builds
 * allowlist configured, so a package that needs one would silently fail to
 * fetch its browser on `pnpm install --frozen-lockfile` (Render's build
 * command). Versions are pinned to a matched Chromium build (puppeteer-core
 * 25.11.0 ships Chromium 153.0.8010.36; @sparticuz/chromium 153.0.0 is the
 * same major — mismatched pairs are a common source of launch failures).
 * When bumping either, read puppeteer-core's Chromium version from its
 * lib/puppeteer/revisions.js (or pptr.dev/chromium-support) and pick the
 * @sparticuz/chromium release with that same major. Both packages are
 * ESM-only and need Node >=22.12 / ^22.17 respectively (.nvmrc: 22).
 */

const MAX_CONCURRENT_RENDERS = 2;

let browserPromise: Promise<Browser> | null = null;
let activeRenders = 0;
const renderQueue: Array<() => void> = [];

/** Well-known local browser installs — only used off Linux (dev machines), where @sparticuz/chromium's Linux-only binary can't run at all (spawn ENOEXEC on macOS). */
const LOCAL_BROWSER_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
};

export interface BrowserLaunch {
  executablePath: string;
  args: string[];
}

/**
 * Picks the Chromium binary to launch:
 * 1. CHROME_EXECUTABLE_PATH, when set (explicit override, any platform).
 * 2. Off Linux: a locally installed Chrome/Chromium/Edge/Brave.
 * 3. On Linux (Render, CI): @sparticuz/chromium's bundled binary.
 *
 * @sparticuz/chromium only unpacks its bundled shared libraries (libnss3,
 * libnspr4, fonts — the al2023 pack) when it believes it runs on AWS
 * Lambda, and it decides that once, at module import time. Render's native
 * Node runtime isn't Lambda and lacks those system libraries, so without
 * this the launch dies with "libnspr4.so: cannot open shared object file"
 * — the actual cause of NEO-36's "Database error: withTenant" on pwa-dev.
 * Setting AWS_LAMBDA_JS_RUNTIME before a *dynamic* import makes it unpack
 * them into /tmp and set LD_LIBRARY_PATH itself (verified in a
 * node:20-bookworm amd64 container).
 */
export async function resolveBrowserLaunch(): Promise<BrowserLaunch> {
  const override = process.env.CHROME_EXECUTABLE_PATH;
  if (override) return { executablePath: override, args: ["--no-sandbox", "--disable-dev-shm-usage"] };

  if (process.platform !== "linux") {
    const found = (LOCAL_BROWSER_PATHS[process.platform] ?? []).find((path) => existsSync(path));
    if (!found) {
      throw new DocumentRenderError(
        `no local Chrome/Chromium found on ${process.platform} — install Google Chrome or set CHROME_EXECUTABLE_PATH`
      );
    }
    return { executablePath: found, args: [] };
  }

  // @sparticuz/chromium (checked up to 153) only substring-tests this for
  // "20.x"/"22.x"/"24.x", so the value needn't track the real Node version.
  process.env.AWS_LAMBDA_JS_RUNTIME ??= "nodejs20.x";
  const { default: chromium } = await import("@sparticuz/chromium");
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}

/**
 * The one shared browser. Exported for the renderer spec only (it kills the
 * process to prove a crashed browser is replaced, not reused).
 */
export async function getRenderBrowser(): Promise<Browser> {
  if (browserPromise) {
    const cached = await browserPromise.catch(() => null);
    // A browser that crashed / was OOM-killed stays cached as a dead
    // connection ("Connection closed" on every render until a restart) —
    // drop it and launch a fresh one.
    if (cached && !cached.connected) browserPromise = null;
  }
  if (!browserPromise) {
    const current: Promise<Browser> = (async () => {
      const { executablePath, args } = await resolveBrowserLaunch();
      const browser = await puppeteer.launch({ args, executablePath, headless: true });
      browser.once("disconnected", () => {
        if (browserPromise === current) browserPromise = null;
      });
      return browser;
    })().catch((err: unknown) => {
      // Don't cache a rejected launch — let the next call retry instead of
      // every future render failing forever off one transient error.
      if (browserPromise === current) browserPromise = null;
      throw err;
    });
    browserPromise = current;
  }
  return browserPromise;
}

// Caps how many PDF renders run at once against the one shared browser — a
// burst of invite-accepts or patient-document generations shouldn't be able
// to open unbounded concurrent pages on Render's single-process free-tier
// service. Callers beyond the cap just wait their turn.
function acquireRenderSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => renderQueue.push(resolve));
}

function releaseRenderSlot(): void {
  const next = renderQueue.shift();
  if (next) {
    next();
  } else {
    activeRenders = Math.max(0, activeRenders - 1);
  }
}

export interface RenderHtmlToPdfOptions {
  /** Puppeteer footerTemplate HTML — page.pdf() only paginates a real per-page footer via this option, not repeated CSS in the document body. */
  footerTemplate?: string;
  /** headerTemplate HTML — defaults to an empty header (the templates carry their own in-body header instead). */
  headerTemplate?: string;
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  /**
   * Per-instance dynamic values (a specific patient's name, a specific
   * doctor's clinic, ...) keyed by the template's `data-field="key"`
   * attribute — see e.g. packages/documents/templates/informedConsent.html's
   * own header comment, which has always documented this as "filled via
   * page.evaluate() + element.textContent inside the real Chrome DOM," not
   * string substitution on the HTML before it gets here. This is the first
   * real implementation of that documented step (nothing called
   * renderHtmlToPdf in production before this). Applied via
   * element.textContent (auto-escaping, safer than a string .replace() on
   * raw HTML) to every matching `[data-field="key"]` element right after
   * page.setContent, before page.pdf() runs. Callers never get a Puppeteer
   * Page handle directly — this file's own header comment requires every
   * generator to go through renderHtmlToPdf() only.
   */
  dataFields?: Record<string, string>;
  /**
   * Images placed into `[data-field="key"]` elements — a drawn signature
   * (data:image/png;base64 only: the page lockdown allows data: URLs and
   * nothing else, and callers validate the format first). The element's
   * content is replaced by one <img>.
   */
  dataImages?: Record<string, string>;
  /**
   * Partner documents (NEO-51): PNG data URLs placed into `[data-image="key"]`
   * elements — the doctor's and NeoSleep signatory's signatures. Same rules as
   * the PWA preview's applyDocumentFields (packages/documents), so the preview
   * and the signed PDF match.
   */
  imageFields?: Record<string, string>;
  /** Keeps only `[data-variant]` elements with this value (e.g. the agreement's "owner"/"staff" party clause). */
  variant?: string | null;
}

const PNG_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Exported for the spec; callers go through renderHtmlToPdf(). */
export async function applyDataImages(
  page: Page,
  images: Record<string, string>,
  attribute: "data-field" | "data-image" = "data-field"
): Promise<void> {
  for (const [key, url] of Object.entries(images)) {
    if (!PNG_DATA_URL_RE.test(url)) throw new DocumentRenderError(`data image for "${key}" must be a PNG data URL`);
  }
  await page.evaluate((values, attr) => {
    for (const [key, src] of Object.entries(values)) {
      document.querySelectorAll<HTMLElement>(`[${attr}="${CSS.escape(key)}"]`).forEach((el) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        // Fit the box: a phone canvas is ~2-3x the box's size at device pixel
        // ratio, and an unconstrained image spills out and across a page break.
        // Partner templates (data-image) size their own .sig-image img, matching the PWA preview.
        if (attr === "data-field") img.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";
        el.style.breakInside = "avoid";
        el.replaceChildren(img);
      });
    }
  }, images, attribute);
}

/** Removes `[data-variant]` elements whose value differs — exported for the spec. */
export async function applyVariant(page: Page, variant: string): Promise<void> {
  await page.evaluate((value) => {
    document.querySelectorAll("[data-variant]").forEach((el) => {
      if (el.getAttribute("data-variant") !== value) el.remove();
    });
  }, variant);
}

/** The only hosts a template may load from — the Poppins webfont the templates link. */
const ALLOWED_REQUEST_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/**
 * Rendered HTML includes admin-authored content (document_content_version)
 * and Chromium runs unsandboxed on Render (@sparticuz/chromium's args carry
 * --no-sandbox): page scripts are disabled and every request other than
 * data:/about: and the webfont hosts is aborted, so a template can't make
 * the API host fetch arbitrary URLs. Data fields are still filled —
 * page.evaluate goes through CDP, unaffected by the page's own JS switch
 * (covered by documentRenderer.spec.ts).
 */
export async function lockDownPage(page: Page): Promise<void> {
  await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("about:")) return void request.continue();
    try {
      const { protocol, hostname } = new URL(url);
      if (protocol === "https:" && ALLOWED_REQUEST_HOSTS.has(hostname)) return void request.continue();
    } catch {
      // unparseable → abort below
    }
    void request.abort();
  });
}

/**
 * Fills every `[data-field="key"]` element — not just the first; a
 * template can repeat a field (e.g. the patient name in the header and
 * again in the signature block). textContent, so values are auto-escaped.
 * Exported only so the spec can assert on the live DOM; callers go through
 * renderHtmlToPdf().
 */
export async function applyDataFields(page: Page, fields: Record<string, string>): Promise<void> {
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) {
      document.querySelectorAll(`[data-field="${CSS.escape(key)}"]`).forEach((el) => {
        el.textContent = value;
      });
    }
  }, fields);
}

const RENDER_READY_TIMEOUT_MS = 10_000;

/**
 * Waits until the page is safe to print: every webfont face in use is
 * loaded and every image (including data: signatures) is decoded.
 *
 * Replaces setContent's old waitUntil "networkidle0", which puppeteer-core
 * >=24.43 no longer accepts for setContent. "load" alone is not enough: it
 * fires once the Google Fonts stylesheet is in, but the font files it
 * points to are only fetched when layout needs a glyph — and data fields
 * filled after load can pull in another unicode-range subset (e.g. "ó" ->
 * latin-ext). So this runs after all DOM mutations: force a layout so font
 * loads get scheduled, await document.fonts.ready, then decode every image
 * (a broken/aborted image rejects decode() and is ignored — lockDownPage
 * aborts foreign requests on purpose). Works with page JS disabled:
 * page.evaluate goes through CDP. Exported for the spec.
 */
export async function waitForRenderReady(page: Page, timeoutMs = RENDER_READY_TIMEOUT_MS): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DocumentRenderError(`fonts/images not ready after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([
      page.evaluate(async () => {
        void document.body?.offsetHeight;
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
        await document.fonts.ready;
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function renderHtmlToPdf(html: string, options: RenderHtmlToPdfOptions = {}): Promise<Uint8Array> {
  await acquireRenderSlot();
  try {
    const browser = await getRenderBrowser();
    const page = await browser.newPage();
    try {
      await lockDownPage(page);
      await page.setContent(html, { waitUntil: "load" });
      if (options.dataFields) await applyDataFields(page, options.dataFields);
      if (options.variant) await applyVariant(page, options.variant);
      if (options.dataImages) await applyDataImages(page, options.dataImages);
      if (options.imageFields) await applyDataImages(page, options.imageFields, "data-image");
      // After every DOM mutation above: webfonts settled, every image decoded.
      await waitForRenderReady(page);
      const displayHeaderFooter = Boolean(options.headerTemplate || options.footerTemplate);
      return await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter,
        headerTemplate: options.headerTemplate ?? "<div></div>",
        footerTemplate: options.footerTemplate ?? "<div></div>",
        margin: {
          top: options.marginTop ?? "18mm",
          bottom: options.marginBottom ?? "14mm",
          left: options.marginLeft ?? "14mm",
          right: options.marginRight ?? "14mm",
        },
      });
    } finally {
      await page.close();
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DocumentRenderError((err as Error)?.message?.split("\n")[0] ?? "unknown error", err);
  } finally {
    releaseRenderSlot();
  }
}
