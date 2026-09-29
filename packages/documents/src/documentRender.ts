import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documentT, normalizeLocale } from "./documentI18n.js";
import { getDocumentRefCode } from "./documentManifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Both live at the package root (sibling to src/ and dist/), not under src/
// — tsc only compiles .ts files into dist/, so a templates/ or assets/
// directory nested under src/ would silently vanish from the compiled
// output. Same convention @neo/email uses for its own local assets.
const TEMPLATES_DIR = path.join(__dirname, "../templates");
const ASSETS_DIR = path.join(__dirname, "../assets");

/**
 * Brand tokens duplicated here rather than imported from packages/brand:
 * packages/brand has no package.json / build output — it's consumed via a
 * Vite path alias (`@brand/...`) that only resolves inside a Vite build, not
 * a plain tsc-compiled Node package like this one. @neo/email hit the same
 * constraint and solved it the same way (see its emailTemplates.ts BRAND
 * const) — keep these values in sync with packages/brand/colors.ts by hand
 * if the palette ever changes.
 */
const BRAND = {
  primary: "#128F83",
  secondary: "#474747",
} as const;

/**
 * NeoSleep's contact details per jurisdiction, used both in the Puppeteer
 * footerTemplate (see renderDocumentFooterHtml below) and as the
 * {{brand:contactLine}} token for a template's in-page "screen only"
 * preview footer. Keyed by the same locale a document is rendered with —
 * showing the Mexico office's address on a Poland-jurisdiction GDPR
 * document (or vice versa) would be actively misleading on a legal
 * document, not just cosmetically wrong, so this must never fall back to
 * a single shared line the way brand colors/logo safely can.
 *
 * `mx` is real (the office already used in the patient informed-consent
 * document). `pl` confirmed by Łukasz 2026-09-16 — Ostrowski Investment
 * sp. z o.o.'s registered address (Łąkowa 3, 77-127 Nakla) — no dedicated
 * PL phone/email exists yet, so the shared company inbox is used. `en`
 * (used when no jurisdiction-specific office applies) falls back to the
 * general company email only, not a fabricated address.
 */
const CONTACT_LINES: Record<"en" | "pl" | "mx", readonly string[]> = {
  mx: [
    "NeoSleep · Lorena González",
    "+52 55 4910 0921 · lorena.gonzalez@neosleepcare.com",
    "WTC, Calle Montecito 38, Col. Nápoles, Piso 26, Oficina 8, Ciudad de México",
  ],
  pl: ["NeoSleep", "info@neosleepcare.com", "Łąkowa 3, 77-127 Nakla, Polska"],
  en: ["NeoSleep", "info@neosleepcare.com"],
};

function getContactLines(locale: string | null | undefined): readonly string[] {
  return CONTACT_LINES[normalizeLocale(locale)];
}

/**
 * Legal-entity identity per jurisdiction, interpolated into i18n strings
 * via documentT()'s {legalEntityName}/{company} params (not a {{brand:...}}
 * token — those are for content baked directly into the template, this is
 * standard vue-i18n-style $t(key, params) interpolation, same mechanism
 * apps/web's PrivacyView.vue uses). `[PLACEHOLDER]` entries are the same
 * unconfirmed facts flagged in apps/web/src/config/websiteContent.ts's
 * legalConfig — keep both in sync by hand until there's a real source of
 * truth to import from (see that file's own comment for why this can't
 * just be a shared import today). `mx` confirmed by Łukasz 2026-09-17:
 * "AJ Management" is a trade name — the actual responsable is a persona
 * física (individual), Alfredjan de Jesús Díaz Urdaneta, RFC
 * DIUA8208043U7 (13-char individual-format RFC, not a corporate one).
 */
const LEGAL_ENTITY: Record<"en" | "pl" | "mx", { companyName: string; legalEntityName: string }> = {
  en: { companyName: "NeoSleep", legalEntityName: "[PLACEHOLDER: registered legal entity name]" },
  pl: {
    companyName: "NeoSleep",
    legalEntityName: "Ostrowski Investment spółka z ograniczoną odpowiedzialnością (KRS 0001166320, NIP 8421798790)",
  },
  mx: {
    companyName: "NeoSleep",
    legalEntityName: "AJ Management — Alfredjan de Jesús Díaz Urdaneta (RFC: DIUA8208043U7)",
  },
};

function getLegalEntityParams(locale: string | null | undefined): Record<string, string> {
  const entity = LEGAL_ENTITY[normalizeLocale(locale)];
  return { company: entity.companyName, legalEntityName: entity.legalEntityName };
}

/**
 * Applies the same {name}-style param interpolation documentT() uses
 * internally, but directly to a plain content string instead of an i18n-key
 * lookup — this is what lets admin-editable document content (see
 * docs/stories/document-content-editor.md) keep using the exact same
 * {legalEntityName}/{company} substitution the static i18n prose already
 * relied on, without the admin-authored text ever needing to be an i18n key
 * itself. A no-op for content that doesn't contain any of the given params'
 * {name} placeholders.
 */
export function fillContentParams(contentHtml: string, params: Record<string, string>): string {
  let filled = contentHtml;
  for (const [name, value] of Object.entries(params)) {
    filled = filled.replaceAll(`{${name}}`, value);
  }
  return filled;
}

/**
 * Admin-authored document content with the locale's legal-entity params
 * ({legalEntityName}, {company}) filled in — the same text the PDF shows,
 * for showing a consent on screen before it is signed (patient QR flow).
 * The caller still sanitizes it for display.
 */
export function fillContentForLocale(contentHtml: string, locale: string | null | undefined): string {
  return fillContentParams(contentHtml, getLegalEntityParams(locale));
}

let cachedLogoSvg: string | null = null;

function loadBrandSvg(filename: string): string {
  const raw = fs.readFileSync(path.join(ASSETS_DIR, filename), "utf-8");
  // Strip the XML declaration (invalid outside a standalone XML document —
  // browsers can choke on it mid-page) and any exporter-generated <!--
  // comments --> inside the SVG (e.g. "Generator: Adobe Illustrator...")
  // before this gets string-inlined into an HTML template: an un-stripped
  // inner comment can prematurely close whatever outer HTML comment this
  // token happens to be substituted inside of, silently corrupting the
  // rest of the document. Trim() removes the blank line stripping the XML
  // declaration leaves behind.
  return raw
    .replace(/<\?xml[^>]*\?>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function getBrandLogoSvg(): string {
  if (cachedLogoSvg === null) cachedLogoSvg = loadBrandSvg("logo_light.svg");
  return cachedLogoSvg;
}

/** Same cached SVG as getBrandLogoSvg(), with an explicit height forced onto the <svg> root so it scales correctly wherever it's inlined (the source file has a viewBox but no width/height attributes, which browsers size inconsistently by default). */
function getBrandLogoSvgAtHeight(heightPx: number): string {
  return getBrandLogoSvg().replace("<svg ", `<svg style="height:${heightPx}px;width:auto;display:block;" `);
}

let cachedDocFieldsCss: string | null = null;

/** Shared field-grid CSS (patient / doctor / clinic / date block) — one source for every template, see assets/docFields.css. */
function getDocFieldsCss(): string {
  if (cachedDocFieldsCss === null) cachedDocFieldsCss = fs.readFileSync(path.join(ASSETS_DIR, "docFields.css"), "utf-8").trim();
  return cachedDocFieldsCss;
}

let cachedDocThemeCss: string | null = null;

/** Shared header + title-band CSS (clinical theme) — one source for every template, see assets/docTheme.css. */
function getDocThemeCss(): string {
  if (cachedDocThemeCss === null) cachedDocThemeCss = fs.readFileSync(path.join(ASSETS_DIR, "docTheme.css"), "utf-8").trim();
  return cachedDocThemeCss;
}

function loadTemplate(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.html`), "utf-8");
}

/**
 * Fills the template's two *static* (non-per-instance) token kinds:
 *   {{brand:primary}} / {{brand:secondary}} / {{brand:logo}} — same for
 *     every render, sourced from BRAND/getBrandLogoSvg() above.
 *   {{style:docFields}} — shared field-grid CSS (assets/docFields.css).
 *   {{style:docTheme}} — shared header + title-band CSS (assets/docTheme.css).
 *   {{documents.<template>.<key>}} — locale-driven prose, sourced from
 *     packages/i18n/{en,pl,mx}.json via documentT().
 *
 * Deliberately does NOT touch data-field="..." attributes — those carry
 * *per-instance* dynamic data (a specific patient's name, a specific
 * doctor's clinic, a signature) that the API layer fills in later via
 * Puppeteer DOM manipulation (page.evaluate + element.textContent), not
 * string substitution here — see apps/api/src/services/documentRenderer.ts
 * and docs/stories/partner-registration-legal-documents.md for why that
 * split exists (textContent auto-escapes user-entered data; a plain string
 * .replace() on raw HTML wouldn't).
 *
 * Safe to do via plain string replacement (not a real HTML parser/DOM):
 * every value substituted here is our own authored, trusted content (brand
 * tokens, translated legal/clinical prose) — never data a form submitter
 * typed in — so there's no injection surface to guard against, matching
 * @neo/email's emailTemplates.ts, which fills its own HTML the same way.
 */
function fillStaticTokens(html: string, locale: string | null | undefined): string {
  let filled = html
    .replaceAll("{{brand:primary}}", BRAND.primary)
    .replaceAll("{{brand:secondary}}", BRAND.secondary)
    .replaceAll("{{brand:logo}}", getBrandLogoSvg())
    .replaceAll("{{brand:contactLine}}", getContactLines(locale).join(" · "))
    .replaceAll("{{style:docFields}}", getDocFieldsCss())
    .replaceAll("{{style:docTheme}}", getDocThemeCss());

  const params = getLegalEntityParams(locale);
  const i18nTokenPattern = /\{\{(documents\.[a-zA-Z0-9_.]+)\}\}/g;
  filled = filled.replace(i18nTokenPattern, (_match, key: string) => documentT(locale, key, params));
  // i18n prose can reference a per-instance value inline — e.g. a party
  // clause "[[doctor_name]], licence no. [[license_number]], …" — as
  // [[field]] markers, which become empty data-field spans for the API to
  // fill (applyDocumentFields). Runs on our own trusted template + i18n text
  // only, before any admin-authored content is spliced in (see
  // renderDocumentHtml's ordering comment), so admin text can never inject one.
  filled = filled.replace(/\[\[([a-z_]+)\]\]/g, (_match, field: string) => `<span class="field-value" data-field="${field}"></span>`);
  return filled;
}

/**
 * Renders a template into HTML ready for apps/api's renderHtmlToPdf():
 * brand tokens and locale-specific static prose are filled in; data-field
 * attributes (per-instance dynamic values) are left untouched for the
 * caller to fill via Puppeteer DOM manipulation before calling page.pdf().
 *
 * `contentHtml`, when given, is the admin-edited body content fetched from
 * platform.document_content_version (see docs/stories/document-content-editor.md)
 * — apps/api's job is exactly "fetch the current version's content_html,
 * pass it here," nothing more; this package stays fully DB-free.
 *
 * SAFETY-CRITICAL ORDERING: contentHtml is admin-authored, not
 * NeoSleep-authored-and-trusted like everything fillStaticTokens fills in
 * above (see that function's own comment on why plain string substitution
 * is safe for those, specifically because nothing there is external input).
 * contentHtml must therefore never be re-scanned by fillStaticTokens' own
 * {{documents.*}}/{{brand:*}} regex passes — if it were, an admin typing a
 * literal "{{brand:primary}}" or "{{documents.foo.bar}}" string into the
 * editor would get silently resolved/corrupted. So: fillStaticTokens runs
 * FIRST (as if contentHtml didn't exist), fillContentParams runs on
 * contentHtml SEPARATELY, and the {{content}} splice is a single literal,
 * non-regex .replace() done LAST, after both passes are already finished.
 *
 * `slots` (NEO-51) are additional admin-authored content blocks for
 * templates that embed a second document — e.g. the partner agreement's
 * Annex 1 (the DPA, its own separately-versioned content) goes into a
 * named slot token ("{{slot:annex}}"). Each slot gets the same treatment
 * as `contentHtml`: params filled on the content alone, and the splice is a
 * single regex pass over the static template, so no inserted content is
 * ever re-scanned for another slot or content token.
 */
export function renderDocumentHtml(
  templateName: string,
  locale: string | null | undefined,
  contentHtml?: string,
  slots?: Record<string, string>,
): string {
  const html = fillStaticTokens(loadTemplate(templateName).replaceAll("{{doc:ref}}", getDocumentRefCode(templateName)), locale);
  if (contentHtml === undefined) return html;
  const params = getLegalEntityParams(locale);
  const filledContent = fillContentParams(contentHtml, params);
  // Guards the exact mistake this splice is designed to prevent: a template
  // author mentioning the literal "{{content}}" string a second time (e.g.
  // in a doc comment describing the slot) would make String.replace()
  // silently fill the FIRST occurrence it finds — which may not be the real
  // slot — and leave the actual .doc-content div showing raw "{{content}}"
  // text. Caught exactly this way once already; fail loudly instead of
  // silently mis-splicing.
  const occurrences = html.split("{{content}}").length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `renderDocumentHtml: expected exactly one "{{content}}" slot in template "${templateName}", found ${occurrences}`
    );
  }
  const filledSlots = new Map<string, string>();
  for (const [name, slotHtml] of Object.entries(slots ?? {})) {
    const slotOccurrences = html.split(`{{slot:${name}}}`).length - 1;
    if (slotOccurrences !== 1) {
      throw new Error(
        `renderDocumentHtml: expected exactly one "{{slot:${name}}}" in template "${templateName}", found ${slotOccurrences}`
      );
    }
    filledSlots.set(name, fillContentParams(slotHtml, params));
  }
  return html.replace(/\{\{content\}\}|\{\{slot:([a-zA-Z0-9_]+)\}\}/g, (_match, slotName: string | undefined) => {
    if (slotName === undefined) return filledContent;
    // A slot the caller didn't provide (e.g. the editor previewing the
    // agreement body alone) renders empty rather than as raw token text.
    return filledSlots.get(slotName) ?? "";
  });
}

/** Muted gray for the footer's second line. Puppeteer's footerTemplate renders in its own isolated frame with no access to the main page's stylesheet/CSS variables, so every footer color is a literal inline value, not var(--secondary). */
const FOOTER_TEXT_COLOR = "#8A8A89";

/** The first line (who the document is about, page number) — readable, not loud. */
const FOOTER_STRONG_COLOR = "#3F4A48";

/** Hairline above the footer. */
const FOOTER_BORDER_COLOR = "#DFE6E4";

/** Footer values include people's names typed into the app — escape them before they go into the footer HTML string. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface DocumentFooterOptions {
  /** Who the document is about, printed bold on every page — the patient's name + date of birth, or the partner doctor's name. */
  subject?: string;
  /** Who issued it, joined into one short line — e.g. the doctor's clinic (name, address, phone). Defaults to NeoSleep's contact for the locale. */
  issuer?: readonly string[];
}

/**
 * Puppeteer page.pdf()'s footerTemplate option is the only reliable way to
 * repeat a footer on every page (CSS repeated-per-page footers aren't
 * consistent across browsers, see the informedConsent template's own header
 * comment) — this builds that footer HTML.
 *
 * Document system (Łukasz, 2026-09-26): a hairline, then two lines.
 * Line 1: who the document is about — a loose page must still say whose it
 * is, which is why the patient's name + date of birth go on every page —
 * and "Page X of Y". Line 2, smaller: the issuer in one line and the
 * document code + version. No logo (it heads page 1).
 * pageNumber/totalPages are Puppeteer's own placeholder classes, filled in by
 * Chrome itself. A verification ID + QR code slot is planned here, not built
 * (docs/stories/document-authenticity-verification.md).
 */
export function renderDocumentFooterHtml(
  docRefCode: string,
  locale: string | null | undefined,
  options: DocumentFooterOptions = {},
): string {
  const pageWord = documentT(locale, "documents.common.page");
  const ofWord = documentT(locale, "documents.common.of");
  const issuer = (options.issuer ?? getContactLines(locale))
    .filter((part) => part.trim() !== "")
    .map(escapeHtml)
    .join(" · ");
  const subject = escapeHtml(options.subject ?? "");
  return `<div style="width:100%;box-sizing:border-box;padding:0 14mm;font-family:Arial,sans-serif;font-size:7pt;color:${FOOTER_TEXT_COLOR};line-height:1.5;">
    <div style="border-top:1px solid ${FOOTER_BORDER_COLOR};padding-top:5px;display:flex;justify-content:space-between;gap:6mm;color:${FOOTER_STRONG_COLOR};font-size:7.5pt;">
      <span style="font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${subject}</span>
      <span style="font-weight:700;white-space:nowrap;">${pageWord} <span class="pageNumber"></span> ${ofWord} <span class="totalPages"></span></span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:6mm;">
      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${issuer}</span>
      <span style="white-space:nowrap;">${escapeHtml(docRefCode)}</span>
    </div>
  </div>`;
}

export { normalizeLocale };
