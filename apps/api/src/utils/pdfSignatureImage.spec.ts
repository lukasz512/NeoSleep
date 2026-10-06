import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { renderDocumentHtml } from "@neo/documents";
import { renderHtmlToPdf, resolveBrowserLaunch } from "../services/documentRenderer.js";
import { encodePng, signaturePngFromPdf } from "./pdfSignatureImage.js";

const launch = await resolveBrowserLaunch().catch((err: unknown) => {
  console.warn(`[pdfSignatureImage.spec] skipping real-render tests: ${(err as Error).message}`);
  return null;
});

/** A 40×12 "signature": a navy stroke across a transparent canvas, like SignaturePad's output. */
function strokePng(): string {
  const width = 40;
  const height = 12;
  const rgba = Buffer.alloc(width * height * 4);
  for (let x = 2; x < 38; x++) {
    const y = 6 + Math.round(4 * Math.sin(x / 4));
    rgba.set([0x1d, 0x2b, 0x5a, 0xff], (y * width + x) * 4);
  }
  return `data:image/png;base64,${encodePng(width, height, rgba).toString("base64")}`;
}

/** Visible pixels of a PNG written by encodePng (filter 0 rows): color only where alpha > 0, which is all a print shows. */
function visiblePixels(dataUrl: string): string[] {
  const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const width = png.readUInt32BE(16);
  const idat = png.indexOf("IDAT");
  const rows = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += width * 4 + 1)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rows.subarray(i + 1 + x * 4, i + 5 + x * 4);
      out.push(a ? `${r},${g},${b},${a}` : "0");
    }
  return out;
}

describe.skipIf(!launch)("signaturePngFromPdf (NEO-255 D2, real Chromium)", () => {
  it("recovers the drawn signature from a signed consent PDF, pixel for pixel", { timeout: 60_000 }, async () => {
    const signature = strokePng();
    const html = renderDocumentHtml("informedConsent", "mx", "<p>Declaro que el especialista me explicó el tratamiento.</p>");
    const pdf = await renderHtmlToPdf(html, { dataFields: { nombre_paciente: "Ana" }, dataImages: { firma_paciente: signature } });
    const recovered = signaturePngFromPdf(pdf);
    expect(recovered).not.toBeNull();
    expect(visiblePixels(recovered!)).toEqual(visiblePixels(signature));
  });

  it("is null for a consent without a drawn signature", { timeout: 60_000 }, async () => {
    const html = renderDocumentHtml("informedConsent", "mx", "<p>Declaro.</p>");
    expect(signaturePngFromPdf(await renderHtmlToPdf(html))).toBeNull();
  });
});

describe("signaturePngFromPdf", () => {
  it("is null for bytes that aren't a PDF with images", () => {
    expect(signaturePngFromPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull();
  });
});
