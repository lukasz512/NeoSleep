import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { applyDocumentFields } from "@neo/documents";

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

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await chromium.executablePath();
      return puppeteer.launch({
        args: chromium.args,
        executablePath,
        headless: true,
      });
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
  /** PNG data URLs keyed by `data-image="key"` — signatures (NEO-51). Non-PNG values are ignored. */
  imageFields?: Record<string, string>;
  /** Keeps only `[data-variant]` elements with this value (e.g. the agreement's "owner"/"staff" party clause). */
  variant?: string | null;
}

export async function renderHtmlToPdf(html: string, options: RenderHtmlToPdfOptions = {}): Promise<Uint8Array> {
  await acquireRenderSlot();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "networkidle0" });
      if (options.dataFields || options.imageFields || options.variant) {
        // The exact function the PWA preview runs (packages/documents/src/
        // browser/documentFields.ts), serialized into the page — it is
        // self-contained by design so toString() carries all of it.
        const values = {
          dataFields: options.dataFields,
          imageFields: options.imageFields,
          variant: options.variant ?? null,
        };
        await page.evaluate(`(${applyDocumentFields.toString()})(document, ${JSON.stringify(values)})`);
        // An <img> added after setContent's networkidle0 still has to decode
        // before page.pdf() snapshots the page.
        await page.evaluate(async () => {
          await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
        });
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
  } finally {
    releaseRenderSlot();
  }
}
