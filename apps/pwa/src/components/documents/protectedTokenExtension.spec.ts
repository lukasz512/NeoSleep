import { describe, it, expect } from "vitest";
import { htmlToEditorHtml, editorHtmlToPlainHtml, PROTECTED_TOKEN_ATTR } from "./protectedTokenExtension";

describe("htmlToEditorHtml", () => {
  it("wraps a single {name} token as a protectedToken span", () => {
    const out = htmlToEditorHtml("<p>Hello {legalEntityName}!</p>");
    expect(out).toBe(`<p>Hello <span ${PROTECTED_TOKEN_ATTR}="legalEntityName">{legalEntityName}</span>!</p>`);
  });

  it("wraps multiple distinct tokens in the same string", () => {
    const out = htmlToEditorHtml("<p>{legalEntityName} ({company})</p>");
    expect(out).toContain(`<span ${PROTECTED_TOKEN_ATTR}="legalEntityName">{legalEntityName}</span>`);
    expect(out).toContain(`<span ${PROTECTED_TOKEN_ATTR}="company">{company}</span>`);
  });

  it("is a no-op on plain text with no tokens", () => {
    const html = "<p>Plain prose with no tokens at all.</p>";
    expect(htmlToEditorHtml(html)).toBe(html);
  });

  it("does not match a brace pair that isn't a valid identifier (e.g. empty or starting with a digit)", () => {
    expect(htmlToEditorHtml("<p>{} and {1abc}</p>")).toBe("<p>{} and {1abc}</p>");
  });
});

describe("editorHtmlToPlainHtml", () => {
  it("strips a protectedToken span back to its literal {name} text", () => {
    const editorHtml = `<p>Hello <span ${PROTECTED_TOKEN_ATTR}="legalEntityName">{legalEntityName}</span>!</p>`;
    expect(editorHtmlToPlainHtml(editorHtml)).toBe("<p>Hello {legalEntityName}!</p>");
  });

  it("strips multiple spans in the same document", () => {
    const editorHtml =
      `<p><span ${PROTECTED_TOKEN_ATTR}="legalEntityName">{legalEntityName}</span> ` +
      `(<span ${PROTECTED_TOKEN_ATTR}="company">{company}</span>)</p>`;
    expect(editorHtmlToPlainHtml(editorHtml)).toBe("<p>{legalEntityName} ({company})</p>");
  });

  it("is a no-op on HTML with no protectedToken spans", () => {
    const html = "<p>Plain prose.</p><ul><li>one</li></ul>";
    expect(editorHtmlToPlainHtml(html)).toBe(html);
  });
});

describe("round trip", () => {
  it("load-then-save composition returns exactly the original content_html", () => {
    const original = "<p>Administrator: {legalEntityName} ({company}).</p><p>No tokens here.</p>";
    const roundTripped = editorHtmlToPlainHtml(htmlToEditorHtml(original));
    expect(roundTripped).toBe(original);
  });
});
