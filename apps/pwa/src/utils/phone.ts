/**
 * Phone number helpers for PhoneField.vue.
 *
 * Canonical storage format is a single string: "+<callingCode> <localDigits>"
 * (e.g. "+52 1234567890"), written straight into the existing `phone` TEXT
 * column (identities.phone / organization.phone) — no schema change needed.
 * The space is what makes a *custom*, freely-typed calling code (PhoneField's
 * area-code combobox isn't limited to PHONE_AREA_CODES) unambiguous to split
 * back apart on the next edit — without it there's no way to tell where an
 * unlisted code ends and the local number begins. Legacy values saved before
 * this delimiter existed (or before this field existed at all) still parse:
 * see parsePhone()'s fallback.
 */

export const PHONE_AREA_CODES = [
  { code: "+48", country: "PL" },
  { code: "+52", country: "MX" },
  { code: "+66", country: "TH" },
] as const;

const DEFAULT_AREA_CODE = "+48";

// Mirrors apps/api/src/commands/practitioner.ts's own check exactly (strip
// everything but digits, count what's left) so FE and API never disagree on
// what counts as a valid phone number.
export const PHONE_MIN_DIGITS = 9;

export function phoneDigitCount(raw: string | null | undefined): number {
  return String(raw ?? "").replace(/\D/g, "").length;
}

export function countryCodeToAreaCode(countryCode?: string | null): string {
  const match = PHONE_AREA_CODES.find(
    (c) => c.country === (countryCode ?? "").toUpperCase(),
  );
  return match?.code ?? DEFAULT_AREA_CODE;
}

export function parsePhone(
  raw: string | null | undefined,
  fallbackAreaCode: string,
): { areaCode: string; local: string } {
  const s = (raw ?? "").trim();
  if (!s) return { areaCode: fallbackAreaCode, local: "" };

  const match = PHONE_AREA_CODES.find((c) => s.startsWith(c.code));
  if (match) return { areaCode: match.code, local: s.slice(match.code.length).replace(/\D/g, "") };

  // A custom code (not in PHONE_AREA_CODES) saved by this field always has the
  // "+<code> <digits>" delimiter — that space is the only thing that makes an
  // unlisted code's length unambiguous, so only trust it when present.
  const custom = s.match(/^(\+\d{1,4})\s+(.*)$/);
  if (custom) return { areaCode: custom[1], local: custom[2].replace(/\D/g, "") };

  // Unrecognized/legacy format (e.g. a number saved before this field existed,
  // or before the delimiter above existed) — treat the whole thing as local
  // digits under the fallback area code.
  return { areaCode: fallbackAreaCode, local: s.replace(/\D/g, "") };
}

export function formatPhone(areaCode: string, local: string): string {
  const digits = local.replace(/\D/g, "");
  return digits ? `${areaCode} ${digits}` : "";
}
