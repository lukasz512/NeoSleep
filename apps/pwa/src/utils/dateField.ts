/**
 * Pure helpers behind AppDateField.vue (NEO-132): the typed "DD/MM/YYYY" and
 * "HH:MM" masks, their validation, and the time-slot list. Values the app
 * stores stay ISO — "YYYY-MM-DD" for a date, "HH:mm" for a time — only the
 * text in the field follows the user's locale. Native Intl only, no date
 * library in the PWA (same as utils/appointmentTime.ts).
 */

export type DatePart = "d" | "m" | "y";

export interface DateFormat {
  /** Order the parts are typed in, from the locale (PL/MX: d m y, en: m d y). */
  order: DatePart[];
  /** Separator shown between parts ("/" or "."). */
  sep: string;
}

/** A validation failure as an i18n key plus its params — the component resolves it via t(). */
export interface FieldIssue {
  key: string;
  params?: Record<string, string | number>;
}

const PART_LENGTH: Record<DatePart, number> = { d: 2, m: 2, y: 4 };
const pad = (n: number) => String(n).padStart(2, "0");

/** The locale's numeric date layout, e.g. es-MX → d/m/y, pl → d.m.y, en → m/d/y. */
export function dateFormatFor(locale: string): DateFormat {
  const parts = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(
    new Date(Date.UTC(2006, 10, 22)),
  );
  const order: DatePart[] = [];
  for (const p of parts) {
    if (p.type === "day") order.push("d");
    else if (p.type === "month") order.push("m");
    else if (p.type === "year") order.push("y");
  }
  const literal = parts.find((p) => p.type === "literal")?.value.trim() || "/";
  return { order: order.length === 3 ? order : ["d", "m", "y"], sep: literal.charAt(0) };
}

/** Max digits a full date takes — DD + MM + YYYY. A 5th year digit can't be typed. */
export const DATE_DIGITS = 8;
export const TIME_DIGITS = 4;

export function onlyDigits(text: string, max: number): string {
  return text.replace(/\D/g, "").slice(0, max);
}

/**
 * Typed digits → "27/09/2026" as far as typed. A separator is drawn only
 * between parts that both have digits, so Backspace never gets stuck on one.
 */
export function formatDateDigits(digits: string, fmt: DateFormat): string {
  let out = "";
  let i = 0;
  for (const part of fmt.order) {
    const chunk = digits.slice(i, i + PART_LENGTH[part]);
    if (!chunk) break;
    if (i > 0) out += fmt.sep;
    out += chunk;
    i += PART_LENGTH[part];
  }
  return out;
}

function splitDigits(digits: string, fmt: DateFormat): Record<DatePart, string> {
  const out: Record<DatePart, string> = { d: "", m: "", y: "" };
  let i = 0;
  for (const part of fmt.order) {
    out[part] = digits.slice(i, i + PART_LENGTH[part]);
    i += PART_LENGTH[part];
  }
  return out;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO "YYYY-MM-DD" → the digits the user would have typed for it. */
export function isoToDateDigits(iso: string | null | undefined, fmt: DateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return "";
  const byPart: Record<DatePart, string> = { y: m[1]!, m: m[2]!, d: m[3]! };
  return fmt.order.map((p) => byPart[p]).join("");
}

/** Local calendar date of `d` as ISO — "today" is the user's own day, not UTC's. */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localIsoDate(new Date(y!, m! - 1, d! + days));
}

/** "today" is a live token so a config file never bakes in the day it was loaded. */
export type DateBound = string | "today";
export function resolveBound(b: DateBound | undefined): string | undefined {
  if (!b) return undefined;
  return b === "today" ? localIsoDate() : b;
}

/** Locale display of an ISO date — used in messages ("from 01/01/1900"). */
export function formatIsoDate(iso: string, fmt: DateFormat): string {
  return formatDateDigits(isoToDateDigits(iso, fmt), fmt);
}

export interface DateCheck {
  iso: string | null;
  issue: FieldIssue | null;
}

/**
 * Typed digits → an ISO date, or the reason it isn't one. Empty is valid
 * (null) — "required" is the form's rule, not the field's.
 */
export function checkDateDigits(
  digits: string,
  fmt: DateFormat,
  opts: { min?: string; max?: string; monthName?: (month: number, year: number) => string } = {},
): DateCheck {
  if (!digits) return { iso: null, issue: null };
  const pattern = fmt.order.map((p) => (p === "y" ? "YYYY" : p === "m" ? "MM" : "DD")).join(fmt.sep);
  if (digits.length < DATE_DIGITS) return { iso: null, issue: { key: "app.dateField.incomplete", params: { format: pattern } } };
  const parts = splitDigits(digits, fmt);
  const day = Number(parts.d);
  const month = Number(parts.m);
  const year = Number(parts.y);
  if (month < 1 || month > 12) return { iso: null, issue: { key: "app.dateField.invalidMonth" } };
  const dim = daysInMonth(year, month);
  if (day < 1 || day > dim) {
    return {
      iso: null,
      issue: day > dim && day <= 31
        ? { key: "app.dateField.invalidDay", params: { month: opts.monthName?.(month, year) ?? pad(month), year, days: dim } }
        : { key: "app.dateField.invalid" },
    };
  }
  const iso = `${parts.y}-${parts.m}-${parts.d}`;
  const today = localIsoDate();
  if (opts.min && iso < opts.min) {
    return { iso: null, issue: opts.min === today ? { key: "app.dateField.noPast" } : { key: "app.dateField.beforeMin", params: { min: formatIsoDate(opts.min, fmt) } } };
  }
  if (opts.max && iso > opts.max) {
    return { iso: null, issue: opts.max === today ? { key: "app.dateField.noFuture" } : { key: "app.dateField.afterMax", params: { max: formatIsoDate(opts.max, fmt) } } };
  }
  return { iso, issue: null };
}

// ── Time ────────────────────────────────────────────────────────────────

/** Typed digits → "10:3" / "10:30" — the colon appears once the hour is full. */
export function formatTimeDigits(digits: string): string {
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

export function timeToDigits(hhmm: string | null | undefined): string {
  return /^\d{2}:\d{2}$/.test(hhmm ?? "") ? hhmm!.replace(":", "") : "";
}

export interface TimeCheck {
  time: string | null;
  issue: FieldIssue | null;
}

export function checkTimeDigits(digits: string, opts: { min?: string } = {}): TimeCheck {
  if (!digits) return { time: null, issue: null };
  if (digits.length < TIME_DIGITS) return { time: null, issue: { key: "app.dateField.timeIncomplete" } };
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2));
  if (h > 23 || m > 59) return { time: null, issue: { key: "app.dateField.timeInvalid" } };
  const time = `${pad(h)}:${pad(m)}`;
  if (opts.min && time < opts.min) return { time: null, issue: { key: "app.dateField.noPastTime" } };
  return { time, issue: null };
}

/** "HH:mm" slots every `step` minutes from `from` to `to` (inclusive). */
export function timeSlots(step = 15, from = "07:00", to = "21:00"): string[] {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const out: string[] = [];
  for (let t = toMin(from); t <= toMin(to); t += step) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
}

/**
 * Slots a booking of `durationMin` starting there would overlap one of
 * `taken` (wall-clock "HH:mm" start/end pairs on the same day) — the same
 * overlap rule the API's 409 uses, shown before Save instead of after.
 */
export function busySlots(slots: string[], taken: { start: string; end: string }[], durationMin: number): Set<string> {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const busy = new Set<string>();
  for (const slot of slots) {
    const s = toMin(slot);
    const e = s + durationMin;
    if (taken.some((b) => s < toMin(b.end) && toMin(b.start) < e)) busy.add(slot);
  }
  return busy;
}
