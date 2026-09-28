import { describe, expect, it } from "vitest";
import { resolveLocale, switchLocalePath } from "./locale";
import es from "../locales/es.json";
import en from "../locales/en.json";

describe("i18n › routes and first-visit redirect", () => {
  it("/corporativo is Spanish, /corporate is English", () => {
    expect(resolveLocale("/corporativo", ["en-US"])).toEqual({ locale: "es" });
    expect(resolveLocale("/corporate/", ["es-MX"])).toEqual({ locale: "en" });
  });
  it("a bare path redirects by browser language and keeps the query", () => {
    expect(resolveLocale("/", ["es-MX", "en"], "?src=qr")).toEqual({ locale: "es", redirectTo: "/corporativo?src=qr" });
    expect(resolveLocale("/", ["pl-PL"])).toEqual({ locale: "en", redirectTo: "/corporate" });
  });
  it("the language switch keeps ?src=qr", () => {
    expect(switchLocalePath("en", "?src=qr")).toBe("/corporate?src=qr");
  });
});

describe("i18n › static preview (no path routing)", () => {
  it("never redirects; ?lang= wins, else the browser language", () => {
    expect(resolveLocale("/artifact/abc", ["es-MX"], "?lang=en", false)).toEqual({ locale: "en" });
    expect(resolveLocale("/artifact/abc", ["es-MX"], "", false)).toEqual({ locale: "es" });
  });
  it("the language switch sets ?lang= and keeps ?src=qr", () => {
    expect(switchLocalePath("en", "?src=qr", false)).toBe("?src=qr&lang=en");
  });
});

function keys(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe("locales › es and en have the same keys", () => {
  it("parity", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });
});
