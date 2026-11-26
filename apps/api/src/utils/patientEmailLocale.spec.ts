import { describe, it, expect } from "vitest";
import { localeForCountry, patientEmailLocale, SUPPORTED_LANGUAGES } from "./patientEmailLocale.js";

// CORE-261: one region -> language mapping, used by mail and notifications.
describe("localeForCountry", () => {
  it("maps PL to pl, MX to mx, any other or empty country to en", () => {
    expect(localeForCountry("PL")).toBe("pl");
    expect(localeForCountry(" mx ")).toBe("mx");
    expect(localeForCountry("TH")).toBe("en");
    expect(localeForCountry(null)).toBe("en");
    expect(localeForCountry("")).toBe("en");
  });
});

describe("patientEmailLocale (the identity's language wins)", () => {
  it("an explicit pl or es language beats the region", () => {
    expect(patientEmailLocale("pl", "MX")).toBe("pl");
    expect(patientEmailLocale("es-MX", "PL")).toBe("mx");
    expect(patientEmailLocale("mx", null)).toBe("mx");
  });

  it("plain en yields to the region, and en stays en without one", () => {
    expect(patientEmailLocale("en", "MX")).toBe("mx");
    expect(patientEmailLocale("en", "PL")).toBe("pl");
    expect(patientEmailLocale("en", null)).toBe("en");
    expect(patientEmailLocale(null, "TH")).toBe("en");
  });

  it("every supported language resolves to itself", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(patientEmailLocale(language, null)).toBe(language);
    }
  });
});
