import { intlLocale } from "@i18n/language-options";

/**
 * Patient date of birth helpers (NEO-56). The API stores and returns a plain
 * calendar date "YYYY-MM-DD" — never a timestamp — so everything here treats
 * it as UTC midnight and formats it in UTC, which is what keeps it from
 * shifting a day in negative-offset timezones (MX).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string): Date | null {
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * "12 Mar 1968" / "12 mar 1968" — the month is spelled out on purpose: a
 * numeric 03/12/1968 reads as two different dates in en vs pl/mx, and a
 * wrong-patient mix-up is exactly what a second identifier is there to stop.
 * Returns "" for a missing or malformed value.
 */
export function formatDateOfBirth(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  const date = parseIsoDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Form rule: empty is fine; otherwise a real date, not in the future, not before 1900 (mirrors the API's parseDateOfBirth). */
export function dateOfBirthRule(v: unknown, today = new Date()): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true;
  const date = parseIsoDate(s);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (!date || date.getUTCFullYear() < 1900 || date.getTime() > todayUtc) {
    return "app.patients.form.validation.dateOfBirthInvalid";
  }
  return true;
}
