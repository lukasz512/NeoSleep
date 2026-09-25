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
 * 24.34.0 ships Chromium 143.0.7499.169; @sparticuz/chromium 143.0.4 is the
 * same major — mismatched pairs are a common source of launch failures)
 * and both packages are Node >=18 / >=20.11 respectively, compatible with
 * this repo's Node 20 (.nvmrc).
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

  process.env.AWS_LAMBDA_JS_RUNTIME ??= "nodejs20.x";
  const { default: chromium } = await import("@sparticuz/chromium");
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { executablePath, args } = await resolveBrowserLaunch();
      return puppeteer.launch({ args, executablePath, headless: true });
    })().catch((err: unknown) => {
      // Don't cache a rejected launch — let the next call retry instead of
      // every future render failing forever off one transient error.
      browserPromise = null;
      throw err;
    });
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
}

const PNG_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Exported for the spec; callers go through renderHtmlToPdf(). */
export async function applyDataImages(page: Page, images: Record<string, string>): Promise<void> {
  for (const [key, url] of Object.entries(images)) {
    if (!PNG_DATA_URL_RE.test(url)) throw new DocumentRenderError(`data image for "${key}" must be a PNG data URL`);
  }
  await page.evaluate((values) => {
    for (const [key, src] of Object.entries(values)) {
      document.querySelectorAll(`[data-field="${CSS.escape(key)}"]`).forEach((el) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        el.replaceChildren(img);
      });
    }
  }, images);
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

export async function renderHtmlToPdf(html: string, options: RenderHtmlToPdfOptions = {}): Promise<Uint8Array> {
  await acquireRenderSlot();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await lockDownPage(page);
      await page.setContent(html, { waitUntil: "networkidle0" });
      if (options.dataFields) await applyDataFields(page, options.dataFields);
      if (options.dataImages) {
        await applyDataImages(page, options.dataImages);
        // data: images still decode asynchronously — wait so page.pdf() never captures an empty box.
        await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), { timeout: 5000 });
      }
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
