import { isValidLicenseNumber, normalizeLicenseNumber } from "@neo/documents";
import { ValidationError } from "../errors.js";

/**
 * Validates + normalizes a practitioner's `national_ids` payload (NEO-51).
 * Only the licence-number keys are checked — PL `pwz` and MX `cedula`, with
 * the exact same rules the PWA form uses (packages/documents/src/browser/
 * licenseNumber.ts). Blank values are dropped; cédulas are stored as digits
 * only (a specialty cédula's letter prefix, e.g. "AE-", isn't part of the
 * number). Any other key is passed through untouched.
 *
 * `undefined` stays `undefined` (update commands use it to mean "don't
 * touch the column"); `null` stays `null`.
 */
export function normalizeNationalIds(
  input: Record<string, string> | null | undefined,
): Record<string, string> | null | undefined {
  if (input === undefined || input === null) return input;

  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    if (key === "pwz") {
      if (!isValidLicenseNumber("PL", value)) throw new ValidationError("Invalid PWZ licence number");
      out.pwz = value.replace(/\s/g, "");
    } else if (key === "cedula") {
      if (!isValidLicenseNumber("MX", value)) throw new ValidationError("Invalid cédula profesional");
      out.cedula = normalizeLicenseNumber(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
