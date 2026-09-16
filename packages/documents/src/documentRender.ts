import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documentT, normalizeLocale } from "./documentI18n.js";

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
 * document). `pl` has no confirmed real office yet — its lines are
 * explicit [PLACEHOLDER] markers, not invented facts; see
 * docs/stories/partner-registration-legal-documents.md's privacy-policy
 * section for what's needed from Łukasz. `en` (used when no
 * jurisdiction-specific office applies) falls back to the general company
 * email only, not a fabricated address.
 */
const CONTACT_LINES: Record<"en" | "pl" | "mx", readonly string[]> = {
  mx: [
    "NeoSleep · Lorena González",
    "+52 55 4910 0921 · lorena.gonzalez@neosleepcare.com",
    "WTC, Calle Montecito 38, Col. Nápoles, Piso 26, Oficina 8, Ciudad de México",
  ],
  pl: ["NeoSleep", "info@neosleepcare.com", "[PLACEHOLDER: zarejestrowany adres siedziby]"],
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
 * just be a shared import today).
 */
const LEGAL_ENTITY: Record<"en" | "pl" | "mx", { companyName: string; legalEntityName: string }> = {
  en: { companyName: "NeoSleep", legalEntityName: "[PLACEHOLDER: registered legal entity name]" },
  pl: { companyName: "NeoSleep", legalEntityName: "[PLACEHOLDER: pełna nazwa zarejestrowanej spółki]" },
  mx: { companyName: "NeoSleep", legalEntityName: "[PLACEHOLDER: razón social registrada]" },
};

function getLegalEntityParams(locale: string | null | undefined): Record<string, string> {
  const entity = LEGAL_ENTITY[normalizeLocale(locale)];
  return { company: entity.companyName, legalEntityName: entity.legalEntityName };
}

let cachedLogoSvg: string | null = null;

function getBrandLogoSvg(): string {
  if (cachedLogoSvg === null) {
    const raw = fs.readFileSync(path.join(ASSETS_DIR, "logo_light.svg"), "utf-8");
    // Strip the XML declaration (invalid outside a standalone XML document —
    // browsers can choke on it mid-page) and any exporter-generated <!--
    // comments --> inside the SVG (e.g. "Generator: Adobe Illustrator...")
    // before this gets string-inlined into an HTML template: an un-stripped
    // inner comment can prematurely close whatever outer HTML comment this
    // token happens to be substituted inside of, silently corrupting the
    // rest of the document. Trim() removes the blank line stripping the XML
    // declaration leaves behind.
    cachedLogoSvg = raw
      .replace(/<\?xml[^>]*\?>/, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
  }
  return cachedLogoSvg;
}

/** Same cached SVG as getBrandLogoSvg(), with an explicit height forced onto the <svg> root so it scales correctly wherever it's inlined (the source file has a viewBox but no width/height attributes, which browsers size inconsistently by default). */
function getBrandLogoSvgAtHeight(heightPx: number): string {
  return getBrandLogoSvg().replace("<svg ", `<svg style="height:${heightPx}px;width:auto;display:block;" `);
}

function loadTemplate(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.html`), "utf-8");
}

/**
 * Fills the template's two *static* (non-per-instance) token kinds:
 *   {{brand:primary}} / {{brand:secondary}} / {{brand:logo}} — same for
 *     every render, sourced from BRAND/getBrandLogoSvg() above.
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
    .replaceAll("{{brand:contactLine}}", getContactLines(locale).join(" · "));

  const params = getLegalEntityParams(locale);
  const i18nTokenPattern = /\{\{(documents\.[a-zA-Z0-9_.]+)\}\}/g;
  filled = filled.replace(i18nTokenPattern, (_match, key: string) => documentT(locale, key, params));
  return filled;
}

/**
 * Renders a template into HTML ready for apps/api's renderHtmlToPdf():
 * brand tokens and locale-specific static prose are filled in; data-field
 * attributes (per-instance dynamic values) are left untouched for the
 * caller to fill via Puppeteer DOM manipulation before calling page.pdf().
 */
export function renderDocumentHtml(templateName: string, locale: string | null | undefined): string {
  return fillStaticTokens(loadTemplate(templateName), locale);
}

/** Muted gray for the footer specifically — distinct from BRAND.secondary (used for body labels/borders, too dark to read as a footer-quiet tone). Puppeteer's footerTemplate renders in its own isolated frame with no access to the main page's stylesheet/CSS variables, so this has to be a literal inline value, not var(--secondary). */
const FOOTER_TEXT_COLOR = "#8A8A89";

/**
 * Puppeteer page.pdf()'s footerTemplate option is the only reliable way to
 * repeat a footer on every page (CSS repeated-per-page footers aren't
 * consistent across browsers, see the informedConsent template's own header
 * comment) — this builds that footer HTML. Two-column layout: contact block
 * on the left (~2/3 width), small logo + doc-ref/page count on the right
 * (~1/3 width). "documents.common.page" carries just the localized word
 * ("Page"/"Página"/"Strona"); pageNumber/totalPages are Puppeteer's own
 * placeholder classes, filled in by Chrome itself.
 */
export function renderDocumentFooterHtml(docRefCode: string, locale: string | null | undefined): string {
  const pageWord = documentT(locale, "documents.common.page");
  const contactLinesHtml = getContactLines(locale)
    .map((line) => `<div>${line}</div>`)
    .join("");
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;box-sizing:border-box;padding:0 15mm;font-family:Arial,sans-serif;font-size:7.5pt;color:${FOOTER_TEXT_COLOR};line-height:1.5;">
    <div style="width:66%;">${contactLinesHtml}</div>
    <div style="width:34%;text-align:right;">
      <div style="display:flex;justify-content:flex-end;margin-bottom:2px;">${getBrandLogoSvgAtHeight(10)}</div>
      <div>${docRefCode} · ${pageWord} <span class="pageNumber"></span> / <span class="totalPages"></span></div>
    </div>
  </div>`;
}

export { normalizeLocale };
