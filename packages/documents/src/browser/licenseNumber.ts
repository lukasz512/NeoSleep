/**
 * Professional licence number validation — shared by apps/pwa (form rules)
 * and apps/api (command validation), so both runtimes accept exactly the
 * same values. Browser-safe: no Node imports anywhere under src/browser/.
 *
 * - PL: "numer prawa wykonywania zawodu" (PWZ / NPWZ), issued by the Polish
 *   Chamber of Physicians and Dentists (NIL) — same format for lekarz and
 *   lekarz dentysta. Seven digits `KABCDEF` where K is a check digit:
 *   K = (1·A + 2·B + 3·C + 4·D + 5·E + 6·F) mod 11; K is never 0, and a
 *   result of 10 means the number is invalid.
 *   Source: https://nil.org.pl/rejestry/centralny-rejestr-lekarzy/zasady-weryfikowania-nr-prawa-wykonywania-zawodu
 * - MX: "cédula profesional", issued by SEP's Dirección General de
 *   Profesiones — 7 or 8 digits. Specialty cédulas carry a letter prefix
 *   (e.g. "AE-1234567"); only the digits are the number, so non-digits are
 *   stripped before checking.
 */

export type LicenseCountry = "PL" | "MX";

/** Canonical stored form: digits only. */
export function normalizeLicenseNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidPwz(digits: string): boolean {
  if (!/^\d{7}$/.test(digits)) return false;
  const check = Number(digits[0]);
  if (check === 0) return false;
  let sum = 0;
  for (let i = 1; i <= 6; i++) sum += i * Number(digits[i]);
  return sum % 11 === check;
}

function isValidCedula(digits: string): boolean {
  return /^\d{7,8}$/.test(digits);
}

export function isValidLicenseNumber(country: LicenseCountry, value: string): boolean {
  if (country === "PL") {
    // PWZ has no letter prefix — reject anything that isn't already pure digits
    // (after trimming spaces) rather than silently stripping typos.
    const compact = value.replace(/\s/g, "");
    return isValidPwz(compact);
  }
  return isValidCedula(normalizeLicenseNumber(value));
}

/** The `national_ids` JSONB key each country's licence number is stored under. */
export function licenseNumberKey(country: LicenseCountry): "pwz" | "cedula" {
  return country === "PL" ? "pwz" : "cedula";
}

/** Maps an identity region ("PL"/"MX"/other) to a licence country, or null. */
export function licenseCountryForRegion(region: string | null | undefined): LicenseCountry | null {
  const r = (region ?? "").toUpperCase();
  return r === "PL" || r === "MX" ? r : null;
}
