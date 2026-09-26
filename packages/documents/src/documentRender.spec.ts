import { describe, it, expect } from "vitest";
import { renderDocumentHtml, renderDocumentFooterHtml, fillContentParams } from "./documentRender.js";
import { DOCUMENT_MANIFEST, getDocumentRefCode } from "./documentManifest.js";

describe("fillContentParams", () => {
  it("substitutes a {name}-style param", () => {
    expect(fillContentParams("Hello {who}!", { who: "world" })).toBe("Hello world!");
  });

  it("substitutes multiple occurrences of the same param", () => {
    expect(fillContentParams("{x} and {x} again", { x: "A" })).toBe("A and A again");
  });

  it("is a no-op when the content has no matching {name} placeholder", () => {
    const content = "<p>Plain prose with no tokens.</p>";
    expect(fillContentParams(content, { legalEntityName: "Acme" })).toBe(content);
  });

  it("is a no-op on empty params", () => {
    const content = "Some {token} here";
    expect(fillContentParams(content, {})).toBe(content);
  });

  it("leaves an unrelated {{brand:primary}}-style double-brace token untouched — only {name} single-brace params are ever substituted here", () => {
    const filled = fillContentParams("See {{brand:primary}} and {legalEntityName}.", {
      legalEntityName: "Acme Sp. z o.o.",
    });
    expect(filled).toBe("See {{brand:primary}} and Acme Sp. z o.o..");
  });
});

describe("renderDocumentHtml", () => {
  it("renders a known real template without contentHtml exactly as before (backward compatible)", () => {
    const html = renderDocumentHtml("informedConsent", "mx");
    expect(html).toContain("<html");
    expect(html).not.toContain("{{documents.");
    expect(html).not.toContain("{{brand:");
  });

  it("splices contentHtml into a template's {{content}} slot", () => {
    const html = renderDocumentHtml("__test_fixture", "en", "<p>hello from the editor</p>");
    expect(html).toContain('<div class="doc-content"><p>hello from the editor</p></div>');
  });

  it(
    "SAFETY-CRITICAL: a literal {{brand:primary}}/{{documents.*}} substring inside contentHtml survives " +
      "unresolved in the output — contentHtml must never be re-scanned by fillStaticTokens' own regex " +
      "passes, or an admin typing/pasting one of these strings would get it silently (and dangerously) " +
      "resolved/corrupted",
    () => {
      const html = renderDocumentHtml(
        "__test_fixture",
        "en",
        "before {{brand:primary}} and {{documents.testFixture.title}} after"
      );
      expect(html).toContain("before {{brand:primary}} and {{documents.testFixture.title}} after");
      // The template's OWN {{brand:primary}} usage (outside the content slot)
      // must still resolve normally — proves the safety property is specific
      // to the spliced-in content, not a blanket "brand tokens never resolve" regression.
      expect(html).toContain("color: #128F83;");
    }
  );

  it("fills the legalEntityName/company params inside spliced contentHtml, same as static i18n prose does", () => {
    const html = renderDocumentHtml("__test_fixture", "pl", "Administrator: {legalEntityName} ({company})");
    expect(html).toContain("Administrator: Ostrowski Investment spółka z ograniczoną odpowiedzialnością");
    expect(html).toContain("(NeoSleep)");
  });

  it(
    "SAFETY-CRITICAL: throws instead of silently splicing into the wrong occurrence when a template " +
      "mentions the literal {{content}} string more than once — the exact mistake already made once " +
      "(a doc comment naming the token literally) and caught only by manual PDF inspection, not by " +
      "any automated check, before this guard existed",
    () => {
      expect(() => renderDocumentHtml("__test_fixture_duplicate_content", "en", "<p>real content</p>")).toThrow(
        /expected exactly one/
      );
    }
  );
});

describe("renderDocumentHtml — partner onboarding templates (NEO-51)", () => {
  it("splices the agreement body into {{content}} and the DPA into the annex slot, each exactly once", () => {
    const html = renderDocumentHtml("partnerAgreement", "pl", "<p>AGREEMENT BODY</p>", { annex: "<p>DPA BODY</p>" });
    expect(html.split("AGREEMENT BODY").length - 1).toBe(1);
    expect(html.split("DPA BODY").length - 1).toBe(1);
    expect(html.indexOf("AGREEMENT BODY")).toBeLessThan(html.indexOf("DPA BODY"));
    expect(html).not.toContain("{{slot:");
    expect(html).not.toContain("{{content}}");
  });

  it("never re-scans spliced admin content: a slot token typed into the body stays literal text", () => {
    const html = renderDocumentHtml("partnerAgreement", "pl", "<p>{{slot:annex}}</p>", { annex: "<p>DPA</p>" });
    expect(html).toContain("<p>{{slot:annex}}</p>");
    expect(html.split("<p>DPA</p>").length - 1).toBe(1);
  });

  it("renders an unprovided slot as empty rather than raw token text", () => {
    const html = renderDocumentHtml("partnerAgreement", "mx", "<p>body</p>");
    expect(html).not.toContain("{{slot:annex}}");
  });

  it("throws when a slot is passed that the template doesn't have", () => {
    expect(() => renderDocumentHtml("partnerPrivacyNotice", "pl", "<p>x</p>", { annex: "<p>y</p>" })).toThrow(/slot:annex/);
  });

  it("turns [[field]] markers in the i18n party clauses into empty data-field spans, per jurisdiction", () => {
    const pl = renderDocumentHtml("partnerAgreement", "pl", "<p>x</p>");
    expect(pl).toContain("Ostrowski Investment sp. z o.o.");
    expect(pl).toContain('data-variant="owner"');
    expect(pl).toContain('data-variant="staff"');
    expect(pl).toContain('<span class="field-value" data-field="license_number"></span>');
    expect(pl).not.toContain("[[");

    const mx = renderDocumentHtml("partnerAgreement", "mx", "<p>x</p>");
    expect(mx).toContain("Alfredjan de Jesús Díaz Urdaneta");
    expect(mx).toContain("cédula profesional");
  });

  it("has both signature image slots on the agreement", () => {
    const html = renderDocumentHtml("partnerAgreement", "pl", "<p>x</p>");
    expect(html).toContain('data-image="counterparty_signature"');
    expect(html).toContain('data-image="signer_signature"');
  });
});

describe("clinical document theme (header, title band, footer)", () => {
  const templates = DOCUMENT_MANIFEST.filter((e) => e.templateKey !== "__test");

  it.each(templates.map((e) => [e.templateKey, e.locales[0]] as const))(
    "%s: shared theme CSS is inlined, title band present, reference code filled from the manifest",
    (key, locale) => {
      const html = renderDocumentHtml(key, locale);
      expect(html).not.toContain("{{style:docTheme}}");
      expect(html).not.toContain("{{doc:ref}}");
      expect(html).toContain(".doc-title-band {");
      expect(html).toContain('<div class="doc-title-band">');
      expect(html).toContain(`data-field="doc_ref">${getDocumentRefCode(key)}<`);
      expect(html).not.toContain("documents.common.category.");
    },
  );

  it("labels each title band with a localized category", () => {
    expect(renderDocumentHtml("partnerAgreement", "pl")).toContain('<div class="doc-eyebrow">Umowa · Partner medyczny</div>');
    expect(renderDocumentHtml("informedConsent", "mx")).toContain('<div class="doc-eyebrow">Consentimiento informado</div>');
    expect(renderDocumentHtml("stopBang", "en")).toContain('<div class="doc-eyebrow">Screening questionnaire</div>');
  });

  it("footer shows a localized 'page X of Y' pill, the reference code and the jurisdiction's contact block", () => {
    const pl = renderDocumentFooterHtml("NSL-PA-PL v1.1", "pl");
    expect(pl).toContain('Strona <span class="pageNumber"></span> z <span class="totalPages"></span>');
    expect(pl).toContain("NSL-PA-PL v1.1");
    expect(pl).toContain("Łąkowa 3, 77-127 Nakla, Polska");
    const mx = renderDocumentFooterHtml("NSL-SB v1", "mx");
    expect(mx).toContain('Página <span class="pageNumber"></span> de <span class="totalPages"></span>');
    expect(mx).toContain("Ciudad de México");
  });
});
