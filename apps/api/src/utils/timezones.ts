import { ValidationError } from "../errors.js";

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

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "YYYY-MM-DDTHH:mm" of `iso` as a clock in `timeZone` shows it. */
export function utcToWallTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Minutes `timeZone` is ahead of UTC at instant `ms` (whole minutes). */
function offsetMinutes(ms: number, timeZone: string): number {
  const m = WALL_TIME.exec(utcToWallTime(new Date(ms).toISOString(), timeZone))!;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return Math.round((Date.UTC(y, mo - 1, d, h, mi) - ms) / 60_000);
}

/**
 * CORE-120: wall-clock "YYYY-MM-DDTHH:mm" meant in `timeZone` → UTC ISO.
 * The server owns this conversion so a booking reads the same time in the
 * clinic, in the calendar and in the patient's email, whatever zone the
 * booker's device is in. An ambiguous time (clocks go back) takes the earlier
 * instant; a time that never happens (clocks go forward) is rejected.
 */
export function wallTimeToUtc(wall: string, timeZone: string, field = "start_local"): string {
  const m = WALL_TIME.exec(wall);
  if (!m) throw new ValidationError(`${field} must be a local date-time "YYYY-MM-DDTHH:mm"`, field);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (h > 23 || mi > 59 || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new ValidationError(`${field} is not a valid date-time`, field);
  }
  // The zone's offsets a day either side cover any DST change near the
  // answer; keep the candidates that read back as the requested wall time.
  const offsets = new Set([-1, 0, 1].map((days) => offsetMinutes(asUtc + days * 86_400_000, timeZone)));
  const matches = [...offsets]
    .map((off) => asUtc - off * 60_000)
    .filter((ms) => utcToWallTime(new Date(ms).toISOString(), timeZone) === wall)
    .sort((a, b) => a - b);
  if (!matches.length) throw new ValidationError(`${field} does not exist in ${timeZone} (the clocks change at that time)`, field);
  return new Date(matches[0]!).toISOString();
}
