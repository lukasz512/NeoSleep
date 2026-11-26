import { describe, it, expect } from "vitest";
import { applyDocumentFields } from "@documents-browser";

// The same function runs inside Puppeteer when the API renders the signed
// PDF, so the preview and the PDF are filled identically (NEO-51).
function docFrom(body: string): Document {
  return new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${body}</body></html>`, "text/html");
}

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("applyDocumentFields", () => {
  it("fills every matching data-field with escaped text", () => {
    const doc = docFrom('<span data-field="doctor_name"></span><div data-field="doctor_name"></div>');
    applyDocumentFields(doc, { dataFields: { doctor_name: "<b>Anna</b>" } });
    const els = doc.querySelectorAll('[data-field="doctor_name"]');
    expect(els).toHaveLength(2);
    els.forEach((el) => {
      expect(el.textContent).toBe("<b>Anna</b>");
      expect(el.querySelector("b")).toBeNull();
    });
  });

  it("puts a PNG data URL into data-image slots as an <img>", () => {
    const doc = docFrom('<div data-image="signer_signature"></div>');
    applyDocumentFields(doc, { imageFields: { signer_signature: PNG } });
    expect(doc.querySelector('[data-image="signer_signature"] img')?.getAttribute("src")).toBe(PNG);
  });

  it("ignores anything that isn't a PNG data URL", () => {
    const doc = docFrom('<div data-image="signer_signature"></div>');
    applyDocumentFields(doc, { imageFields: { signer_signature: "https://evil.example/x.png" } });
    expect(doc.querySelector("img")).toBeNull();
  });

  it("removes the party-clause variant that wasn't chosen", () => {
    const doc = docFrom('<p data-variant="owner">owner</p><p data-variant="staff">staff</p>');
    applyDocumentFields(doc, { variant: "staff" });
    expect(doc.body.textContent).toBe("staff");
  });

  it("skips keys that could break out of the attribute selector", () => {
    const doc = docFrom('<span data-field="x"></span>');
    expect(() => applyDocumentFields(doc, { dataFields: { 'x"]': "v" } })).not.toThrow();
    expect(doc.querySelector('[data-field="x"]')?.textContent).toBe("");
  });
});
