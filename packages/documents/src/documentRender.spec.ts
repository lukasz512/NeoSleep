import { describe, it, expect } from "vitest";
import { renderDocumentHtml, fillContentParams } from "./documentRender.js";

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
