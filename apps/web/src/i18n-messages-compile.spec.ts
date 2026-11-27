import { describe, it, expect } from "vitest";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import pl from "@i18n/pl.json";
import mx from "@i18n/mx.json";
import dentamedEn from "@i18n/tenants/dentamed/en.json";
import dentamedPl from "@i18n/tenants/dentamed/pl.json";

// CORE-248: a raw "@" in a message (e.g. an e-mail address) is vue-i18n linked
// syntax; compiling it throws "SyntaxError: 10" at render time on prod. This
// renders every message the website ships, in every locale, so a bad message
// fails CI instead of the page. Escape a literal "@" as {'@'}.
const catalogs: Record<string, Record<string, string>> = {
  en,
  pl,
  mx,
  "dentamed-en": dentamedEn,
  "dentamed-pl": dentamedPl,
};

function compileErrors(locale: string, messages: Record<string, string>): string[] {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { [locale]: messages },
    missingWarn: false,
    fallbackWarn: false,
  });
  const failures: string[] = [];
  for (const key of Object.keys(messages)) {
    try {
      i18n.global.t(key);
    } catch (error) {
      failures.push(`${locale}:${key} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failures;
}

describe("i18n messages compile (CORE-248)", () => {
  for (const [locale, messages] of Object.entries(catalogs)) {
    it(`${locale}: every message compiles`, () => {
      expect(compileErrors(locale, messages)).toEqual([]);
    });
  }
});
