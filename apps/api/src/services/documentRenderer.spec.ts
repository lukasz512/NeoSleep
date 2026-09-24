import { describe, it, expect, afterAll } from "vitest";
import puppeteer, { type Browser } from "puppeteer-core";
import { renderDocumentHtml } from "@neo/documents";
import { renderHtmlToPdf, resolveBrowserLaunch, applyDataFields } from "./documentRenderer.js";

/**
 * Real, non-mocked rendering — every other spec mocks renderHtmlToPdf at
 * the boundary, which is exactly how NEO-36 shipped with a renderer that
 * had never once launched Chromium (it failed on Render with a missing
 * libnspr4.so, surfaced as "Database error: withTenant"). On Linux (CI,
 * same path as Render) this exercises @sparticuz/chromium; on macOS a
 * local Chrome. Skipped, with the reason logged, only when no browser
 * binary can be resolved at all.
 */
const launch = await resolveBrowserLaunch().catch((err: unknown) => {
  console.warn(`[documentRenderer.spec] skipping real-render tests: ${(err as Error).message}`);
  return null;
});

describe.skipIf(!launch)("renderHtmlToPdf (real Chromium)", () => {
  let browser: Browser | null = null;

  afterAll(async () => {
    await browser?.close();
  });

  it("renders a real PDF from HTML", { timeout: 60_000 }, async () => {
    const pdf = await renderHtmlToPdf("<html><body><h1>NeoSleep</h1></body></html>");
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the STOP-Bang template end to end with data fields", { timeout: 60_000 }, async () => {
    const html = renderDocumentHtml("stopBang", "mx");
    const pdf = await renderHtmlToPdf(html, { dataFields: { nombre_paciente: "Ana López", score: "5" } });
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("fills every element sharing a data-field, not just the first, and escapes markup", { timeout: 60_000 }, async () => {
    browser = await puppeteer.launch({ ...launch!, headless: true });
    const page = await browser.newPage();
    await page.setContent(
      `<p data-field="nombre_paciente"></p><p data-field="nombre_paciente"></p><p data-field="untouched">keep</p>`
    );

    await applyDataFields(page, { nombre_paciente: "<b>Ana</b>" });

    const texts = await page.$$eval("[data-field='nombre_paciente']", (els) => els.map((el) => el.textContent));
    const html = await page.$eval("[data-field='nombre_paciente']", (el) => el.innerHTML);
    const untouched = await page.$eval("[data-field='untouched']", (el) => el.textContent);
    expect(texts).toEqual(["<b>Ana</b>", "<b>Ana</b>"]);
    expect(html).toBe("&lt;b&gt;Ana&lt;/b&gt;");
    expect(untouched).toBe("keep");
  });
});
