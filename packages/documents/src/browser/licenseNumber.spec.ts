import { describe, expect, it } from "vitest";
import {
  isValidLicenseNumber,
  licenseCountryForRegion,
  licenseNumberKey,
  normalizeLicenseNumber,
} from "./licenseNumber.js";

describe("isValidLicenseNumber — PL (PWZ)", () => {
  // 1·1 + 2·2 + 3·3 + 4·4 + 5·5 + 6·6 = 91; 91 mod 11 = 3
  it("accepts a number whose first digit matches the mod-11 check", () => {
    expect(isValidLicenseNumber("PL", "3123456")).toBe(true);
    // 6·1 = 6
    expect(isValidLicenseNumber("PL", "6000001")).toBe(true);
  });

  it("tolerates surrounding/inner spaces", () => {
    expect(isValidLicenseNumber("PL", " 3 123 456 ")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidLicenseNumber("PL", "4123456")).toBe(false);
  });

  it("rejects a zero check digit even when the sum is 0 mod 11", () => {
    expect(isValidLicenseNumber("PL", "0000000")).toBe(false);
  });

  it("rejects numbers whose checksum is 10 (no valid check digit exists)", () => {
    // 5·2 = 10 → no single digit can match
    for (let k = 0; k <= 9; k++) expect(isValidLicenseNumber("PL", `${k}000020`)).toBe(false);
  });

  it("rejects wrong length and non-digits", () => {
    expect(isValidLicenseNumber("PL", "312345")).toBe(false);
    expect(isValidLicenseNumber("PL", "31234567")).toBe(false);
    expect(isValidLicenseNumber("PL", "31234a6")).toBe(false);
    expect(isValidLicenseNumber("PL", "")).toBe(false);
  });
});

describe("isValidLicenseNumber — MX (cédula profesional)", () => {
  it("accepts 7 and 8 digit cédulas", () => {
    expect(isValidLicenseNumber("MX", "1234567")).toBe(true);
    expect(isValidLicenseNumber("MX", "12345678")).toBe(true);
  });

  it("strips a specialty letter prefix before checking", () => {
    expect(isValidLicenseNumber("MX", "AE-1234567")).toBe(true);
    expect(isValidLicenseNumber("MX", "AESSA - 12345678")).toBe(true);
  });

  it("rejects too short / too long", () => {
    expect(isValidLicenseNumber("MX", "123456")).toBe(false);
    expect(isValidLicenseNumber("MX", "123456789")).toBe(false);
    expect(isValidLicenseNumber("MX", "")).toBe(false);
  });
});

describe("helpers", () => {
  it("normalizes to digits only", () => {
    expect(normalizeLicenseNumber("AE-1234567")).toBe("1234567");
  });

  it("maps country to the national_ids key", () => {
    expect(licenseNumberKey("PL")).toBe("pwz");
    expect(licenseNumberKey("MX")).toBe("cedula");
  });

  it("maps regions to licence countries case-insensitively", () => {
    expect(licenseCountryForRegion("pl")).toBe("PL");
    expect(licenseCountryForRegion("MX")).toBe("MX");
    expect(licenseCountryForRegion("TH")).toBeNull();
    expect(licenseCountryForRegion(null)).toBeNull();
  });
});
