import { describe, it, expect } from "vitest";
import en from "@i18n/en.json";
import pl from "@i18n/pl.json";
import mx from "@i18n/mx.json";

/**
 * Partner names never appear on screen (Łukasz, 2026-10-03, NEO-212).
 * The one exception is the informed consent, a legal text that names the
 * device manufacturers on purpose (NEO-205 D2: it stays).
 */
const PARTNER_NAME = /ortho\s?apnea|biologix/i;
const ALLOWED_KEYS = new Set(["documents.informedConsent.manufacturers"]);

function flatten(node: unknown, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

describe("i18n copy names no partner", () => {
  for (const [lang, messages] of Object.entries({ en, mx, pl })) {
    it(`${lang}.json`, () => {
      const offenders = flatten(messages).filter(([key, value]) => PARTNER_NAME.test(value) && !ALLOWED_KEYS.has(key));
      expect(offenders).toEqual([]);
    });
  }
});
