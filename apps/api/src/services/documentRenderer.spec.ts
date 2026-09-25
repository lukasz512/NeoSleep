import { describe, it, expect, afterAll } from "vitest";
import puppeteer, { type Browser } from "puppeteer-core";
import { renderDocumentHtml } from "@neo/documents";
import {
  renderHtmlToPdf,
  getRenderBrowser,
  resolveBrowserLaunch,
  applyDataFields,
  applyDataImages,
  lockDownPage,
  waitForRenderReady,
} from "./documentRenderer.js";

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

  it("a crashed shared browser is replaced on the next render, not reused as a dead connection", { timeout: 60_000 }, async () => {
    const first = await getRenderBrowser();
    first.process()?.kill("SIGKILL");
    await new Promise<void>((resolve) => (first.connected ? first.once("disconnected", () => resolve()) : resolve()));

    const pdf = await renderHtmlToPdf("<html><body><h1>after a crash</h1></body></html>");
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(await getRenderBrowser()).not.toBe(first);
  });

  it("places a drawn signature (PNG data URL) into its data-field, and rejects anything that isn't one", { timeout: 60_000 }, async () => {
    browser ??= await puppeteer.launch({ ...launch!, headless: true });
    const page = await browser.newPage();
    await lockDownPage(page);
    await page.setContent(`<div class="signature-box" style="width:260px;height:90px" data-field="firma_paciente">placeholder</div>`);
    const onePixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    await applyDataImages(page, { firma_paciente: onePixel });
    const placed = await page.$eval("[data-field='firma_paciente']", (el) => {
      const img = el.querySelector("img")!;
      const box = el.getBoundingClientRect();
      const pic = img.getBoundingClientRect();
      return { children: el.childNodes.length, src: img.getAttribute("src"), fits: pic.width <= box.width && pic.height <= box.height };
    });
    // The image replaces the placeholder and is sized to the box — a phone canvas at 2-3x DPR
    // otherwise spills out of it and across a page break (seen on the signed consent PDF).
    expect(placed).toEqual({ children: 1, src: onePixel, fits: true });

    await expect(applyDataImages(page, { firma_paciente: "https://evil.test/x.png" })).rejects.toThrow(/PNG data URL/);
  });

  it("waitForRenderReady: after filling fields and images, fonts are settled and every image is decoded", { timeout: 60_000 }, async () => {
    browser ??= await puppeteer.launch({ ...launch!, headless: true });
    const page = await browser.newPage();
    await lockDownPage(page);
    await page.setContent(renderDocumentHtml("medicalHistory", "mx"), { waitUntil: "load" });
    await applyDataFields(page, { nombre_paciente: "Ana López Núñez" });
    await applyDataImages(page, {
      firma_paciente: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    });

    await waitForRenderReady(page);

    const state = await page.evaluate(() => ({
      fonts: document.fonts.status,
      images: Array.from(document.images).map((img) => img.complete && img.naturalWidth > 0),
    }));
    expect(state.fonts).toBe("loaded");
    expect(state.images.length).toBeGreaterThan(0);
    expect(state.images.every(Boolean)).toBe(true);
  });

  it("renders the medical-history print form with a signature image", { timeout: 60_000 }, async () => {
    const html = renderDocumentHtml("medicalHistory", "mx");
    const pdf = await renderHtmlToPdf(html, {
      dataFields: { nombre_paciente: "Ana López", q_has_diabetes: "Sí" },
      dataImages: { firma_paciente: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" },
    });
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the STOP-Bang template end to end with data fields", { timeout: 60_000 }, async () => {
    const html = renderDocumentHtml("stopBang", "mx");
    const pdf = await renderHtmlToPdf(html, { dataFields: { nombre_paciente: "Ana López", score: "5" } });
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("fills every element sharing a data-field, not just the first, and escapes markup", { timeout: 60_000 }, async () => {
    browser ??= await puppeteer.launch({ ...launch!, headless: true });
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

  it("locked-down page: template scripts don't run, foreign requests are aborted, data fields still fill", { timeout: 60_000 }, async () => {
    browser ??= await puppeteer.launch({ ...launch!, headless: true });
    const page = await browser.newPage();
    const failed: string[] = [];
    page.on("requestfailed", (request) => failed.push(request.url()));
    await lockDownPage(page);
    await page.setContent(
      `<p data-field="nombre_paciente"></p><img src="https://example.com/track.png"><script>document.body.dataset.ran = "yes";</script>`,
      { waitUntil: "load" }
    );
    await waitForRenderReady(page);

    await applyDataFields(page, { nombre_paciente: "Ana" });

    expect(await page.$eval("body", (b) => b.dataset.ran ?? "no")).toBe("no");
    expect(failed).toContain("https://example.com/track.png");
    expect(await page.$eval("[data-field='nombre_paciente']", (el) => el.textContent)).toBe("Ana");
  });
});
