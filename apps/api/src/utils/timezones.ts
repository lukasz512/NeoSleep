/**
 * Country → IANA zone. v1 has one zone per market; MX's other zones come
 * with per-clinic / per-person settings. Shared by appointments (clinic time)
 * and notifications (recipient's quiet hours).
 */
export const COUNTRY_TIMEZONES: Readonly<Record<string, string>> = {
  PL: "Europe/Warsaw",
  MX: "America/Mexico_City",
  TH: "Asia/Bangkok",
};

export function timezoneForCountry(countryCode: string | null | undefined): string | undefined {
  return countryCode ? COUNTRY_TIMEZONES[countryCode.toUpperCase()] : undefined;
}
