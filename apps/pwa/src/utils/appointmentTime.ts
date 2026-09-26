/**
 * Appointment times live in the clinic's zone (appointment.timezone, NEO-27 /
 * ADR-026): a visit at 10:00 in Mexico City reads 10:00 for everyone, whatever
 * the viewer's own device zone. Native Intl only — no date library in the PWA.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock parts of `iso` as seen in `timeZone`. */
function zonedParts(iso: string, timeZone: string): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** "YYYY-MM-DD HH:mm" in `timeZone` — the format VCalendar positions events by. */
export function toZonedCalendarDateTime(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)}`;
}

/** "YYYY-MM-DDTHH:mm" in `timeZone` — a datetime-local input's value. */
export function toZonedInputValue(iso: string, timeZone: string): string {
  return toZonedCalendarDateTime(iso, timeZone).replace(" ", "T");
}

/** "YYYY-MM-DD" of `iso` in `timeZone` — groups the phone list by the clinic's day. */
export function zonedDateKey(iso: string, timeZone: string): string {
  return toZonedCalendarDateTime(iso, timeZone).slice(0, 10);
}

/**
 * Inverse of toZonedInputValue: a wall-clock "YYYY-MM-DDTHH:mm" meant in
 * `timeZone` → UTC ISO. Two passes settle DST edges (the offset at the guess
 * can differ from the offset at the answer).
 */
export function zonedInputToIso(wall: string, timeZone: string): string {
  const [date, time] = wall.split("T");
  const [y, m, d] = (date ?? "").split("-").map(Number);
  const [h, min] = (time ?? "").split(":").map(Number);
  const target = Date.UTC(y!, m! - 1, d!, h!, min!);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess).toISOString(), timeZone);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += target - seen;
  }
  return new Date(guess).toISOString();
}

/** The viewer's own zone — used for a new booking, before the server has fixed the clinic's. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** "10:00–11:00" in `timeZone`, localized. */
export function formatTimeRange(startIso: string, endIso: string, timeZone: string, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(new Date(startIso))}–${fmt.format(new Date(endIso))}`;
}

/** "Mon, 12 Oct" in `timeZone`, localized. */
export function formatDayLabel(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

/** Short zone label ("CST", "GMT+2") for the "times in clinic time" hint. */
export function timeZoneLabel(iso: string, timeZone: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(new Date(iso));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
