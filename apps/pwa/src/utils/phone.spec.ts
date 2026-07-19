import { describe, it, expect } from "vitest";
import { parsePhone, formatPhone, countryCodeToAreaCode, PHONE_AREA_CODES } from "./phone";

describe("phone utils", () => {
  it("countryCodeToAreaCode maps PL/MX/TH to their calling codes", () => {
    expect(countryCodeToAreaCode("PL")).toBe("+48");
    expect(countryCodeToAreaCode("MX")).toBe("+52");
    expect(countryCodeToAreaCode("TH")).toBe("+66");
  });

  it("countryCodeToAreaCode is case-insensitive", () => {
    expect(countryCodeToAreaCode("pl")).toBe("+48");
  });

  it("countryCodeToAreaCode falls back to +48 for unknown/missing country", () => {
    expect(countryCodeToAreaCode("US")).toBe("+48");
    expect(countryCodeToAreaCode(undefined)).toBe("+48");
    expect(countryCodeToAreaCode(null)).toBe("+48");
  });

  it("parsePhone splits a canonical string into area code + local digits, for each known code", () => {
    for (const { code } of PHONE_AREA_CODES) {
      expect(parsePhone(`${code}123456789`, "+48")).toEqual({ areaCode: code, local: "123456789" });
    }
  });

  it("parsePhone returns empty local digits (and the fallback area code) for an empty/missing input", () => {
    expect(parsePhone("", "+52")).toEqual({ areaCode: "+52", local: "" });
    expect(parsePhone(undefined, "+52")).toEqual({ areaCode: "+52", local: "" });
    expect(parsePhone(null, "+52")).toEqual({ areaCode: "+52", local: "" });
  });

  it("parsePhone treats an unrecognized prefix with no delimiter as plain local digits under the fallback area code", () => {
    expect(parsePhone("+1234567890", "+48")).toEqual({ areaCode: "+48", local: "1234567890" });
  });

  it("parsePhone splits a custom (unlisted) code from its digits via the space delimiter", () => {
    expect(parsePhone("+1 234567890", "+48")).toEqual({ areaCode: "+1", local: "234567890" });
    expect(parsePhone("+420 777123456", "+48")).toEqual({ areaCode: "+420", local: "777123456" });
  });

  it("formatPhone combines an area code with digit-stripped local digits, space-delimited", () => {
    expect(formatPhone("+66", "812-345-678")).toBe("+66 812345678");
  });

  it("formatPhone returns an empty string when there are no local digits", () => {
    expect(formatPhone("+48", "")).toBe("");
    expect(formatPhone("+48", "   ")).toBe("");
  });

  it("round-trips parsePhone(formatPhone(...)) for each known area code", () => {
    for (const { code } of PHONE_AREA_CODES) {
      const formatted = formatPhone(code, "555123456");
      expect(parsePhone(formatted, "+48")).toEqual({ areaCode: code, local: "555123456" });
    }
  });

  it("round-trips parsePhone(formatPhone(...)) for a custom, unlisted area code", () => {
    const formatted = formatPhone("+1", "5551234567");
    expect(formatted).toBe("+1 5551234567");
    expect(parsePhone(formatted, "+48")).toEqual({ areaCode: "+1", local: "5551234567" });
  });
});
