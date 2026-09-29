/**
 * Fills a rendered document's per-instance fields (NEO-51). ONE function,
 * run in two places, so the preview a doctor reads and the PDF they sign
 * are filled identically:
 *   - apps/api's documentRenderer.ts — inside Puppeteer's page (serialized
 *     via Function.prototype.toString(), so this function must stay fully
 *     self-contained: no imports, no references to anything outside its
 *     own body, no helpers).
 *   - apps/pwa's PartnerDocumentDialog.vue — on the preview iframe's
 *     contentDocument.
 *
 * - `dataFields`  → every `[data-field="<key>"]` element gets textContent
 *                   (auto-escaped — values are user data).
 * - `imageFields` → every `[data-image="<key>"]` element gets an <img>,
 *                   but only for PNG data URLs (signatures); anything else
 *                   is ignored rather than set as an arbitrary src.
 * - `variant`     → `[data-variant]` elements whose value differs are
 *                   removed (e.g. the agreement's owner/staff party clause).
 *
 * Keys are restricted to [a-z_] so they can't break out of the attribute
 * selector.
 */
export interface DocumentFieldValues {
  dataFields?: Record<string, string>;
  imageFields?: Record<string, string>;
  variant?: string | null;
}

export function applyDocumentFields(doc: Document, values: DocumentFieldValues): void {
  const keyPattern = /^[a-z_]+$/;
  const pngDataUrl = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

  for (const [key, value] of Object.entries(values.dataFields ?? {})) {
    if (!keyPattern.test(key)) continue;
    doc.querySelectorAll(`[data-field="${key}"]`).forEach((el) => {
      el.textContent = value;
    });
  }

  for (const [key, value] of Object.entries(values.imageFields ?? {})) {
    if (!keyPattern.test(key) || !pngDataUrl.test(value)) continue;
    doc.querySelectorAll(`[data-image="${key}"]`).forEach((el) => {
      const img = doc.createElement("img");
      img.src = value;
      img.alt = "";
      el.replaceChildren(img);
    });
  }

  if (values.variant) {
    doc.querySelectorAll("[data-variant]").forEach((el) => {
      if (el.getAttribute("data-variant") !== values.variant) el.remove();
    });
  }
}
