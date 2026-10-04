import type { AppointmentPatientResponse, AppointmentStatus } from "../db/appointment.js";

/**
 * CORE-116 (decision form confirm-flow-r1, 2026-10-04) — when the patient
 * hears about an upcoming visit:
 *   - 2 days before at 10:00 clinic time: "please confirm" (P1);
 *   - the day before at 10:00: a reminder if confirmed, otherwise asked again
 *     and the clinic is told (P1 "more");
 *   - the booking email itself asks only when that 2-day time has already
 *     passed (P2 "more").
 * Pure functions; the job in commands/appointmentReminders.ts applies them.
 */

/** Hour of the day (clinic time) both scheduled emails go out. */
export const SCHEDULE_HOUR = 10;
export const ASK_DAYS_BEFORE = 2;
export const REMIND_DAYS_BEFORE = 1;
/** CORE-113 part 2: how long before the visit the "Su cita es hoy" reminder with the unsigned consent link goes out. */
export const TODAY_REMINDER_HOURS_BEFORE = 2;
/** CORE-113 Done-when: "never outside 08–20" clinic time — the natural 2-hours-before instant is clamped into this window. */
export const TODAY_REMINDER_WINDOW_START_HOUR = 8;
export const TODAY_REMINDER_WINDOW_END_HOUR = 20;

/** Is the scheduled flow switched on? Off = every booking email asks right away (the CORE-25 behaviour). */
export function appointmentRemindersEnabled(): boolean {
  return process.env.APPOINTMENT_REMINDERS === "on";
}

function zonedParts(at: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** UTC offset of `timeZone` at instant `at`, in ms (local − UTC). */
function offsetMs(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** `hour`:00 clinic time, `days` calendar days before the visit's local date. */
export function localHourDaysBefore(startAt: string, timeZone: string, days: number, hour: number): Date {
  const local = zonedParts(new Date(startAt), timeZone);
  const naive = Date.UTC(local.year, local.month - 1, local.day - days, hour, 0);
  // Two passes settle the offset even when the target sits on the other side of a DST switch.
  let utc = naive - offsetMs(new Date(naive), timeZone);
  utc = naive - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

export interface ScheduleState {
  start_at: string;
  timezone: string;
  status: AppointmentStatus;
  patient_response: AppointmentPatientResponse | null;
  confirm_request_sent_at: string | null;
  day_before_sent_at: string | null;
}

export type ScheduledAction =
  /** "Please confirm" email (2 days before). */
  | "confirm_request"
  /** Already answered before the ask — just record that the ask is done. */
  | "stamp_confirm_request"
  /** Confirmed → "see you tomorrow" email. */
  | "reminder"
  /** No answer by the day before → asked again, clinic notified. */
  | "confirm_again"
  /** "Can't come" → nothing to send the day before. */
  | "stamp_day_before";

export function scheduledAppointmentAction(a: ScheduleState, now: Date): ScheduledAction | null {
  if (a.status !== "scheduled" || new Date(a.start_at).getTime() <= now.getTime()) return null;
  const dayBeforeAt = localHourDaysBefore(a.start_at, a.timezone, REMIND_DAYS_BEFORE, SCHEDULE_HOUR);
  if (!a.day_before_sent_at && now >= dayBeforeAt) {
    if (a.patient_response === "confirmed") return "reminder";
    if (a.patient_response === "cannot_attend") return "stamp_day_before";
    return "confirm_again";
  }
  const askAt = localHourDaysBefore(a.start_at, a.timezone, ASK_DAYS_BEFORE, SCHEDULE_HOUR);
  if (!a.confirm_request_sent_at && now >= askAt) {
    return a.patient_response ? "stamp_confirm_request" : "confirm_request";
  }
  return null;
}

export interface TodayReminderState {
  start_at: string;
  timezone: string;
  status: AppointmentStatus;
  today_reminder_sent_at: string | null;
}

/**
 * CORE-113 Done-when ("never outside 08–20"): the natural 2-hours-before
 * instant, clamped into the clinic's 08:00–20:00 local window on the visit's
 * own calendar date — an early-morning visit gets it at 08:00 instead
 * (shorter notice, still same-day), a late-evening one at 20:00 (longer
 * notice, instead of waiting for a window that opens after the visit).
 */
export function todayReminderDueAt(startAt: string, timeZone: string): Date {
  const natural = new Date(new Date(startAt).getTime() - TODAY_REMINDER_HOURS_BEFORE * 3_600_000);
  const windowStart = localHourDaysBefore(startAt, timeZone, 0, TODAY_REMINDER_WINDOW_START_HOUR);
  const windowEnd = localHourDaysBefore(startAt, timeZone, 0, TODAY_REMINDER_WINDOW_END_HOUR);
  if (natural.getTime() < windowStart.getTime()) return windowStart;
  if (natural.getTime() > windowEnd.getTime()) return windowEnd;
  return natural;
}

/**
 * CORE-113 part 2: is the day-of "Su cita es hoy" reminder due? Independent
 * of the confirm / day-before steps above (its own stamp column) — a visit
 * booked too late for those (both already stamped at booking time, CORE-116
 * P2) still gets this one once its (window-clamped) time has arrived.
 */
export function todayReminderDue(a: TodayReminderState, now: Date): boolean {
  if (a.status !== "scheduled" || a.today_reminder_sent_at) return false;
  const startMs = new Date(a.start_at).getTime();
  if (startMs <= now.getTime()) return false;
  return now.getTime() >= todayReminderDueAt(a.start_at, a.timezone).getTime();
}

/** For a booking / reschedule made at `now`: does its email ask right away, and which scheduled steps does that replace? */
export function bookingStamps(startAt: string, timeZone: string, now: Date): { askNow: boolean; confirmRequest: boolean; dayBefore: boolean } {
  const askAt = localHourDaysBefore(startAt, timeZone, ASK_DAYS_BEFORE, SCHEDULE_HOUR);
  const dayBeforeAt = localHourDaysBefore(startAt, timeZone, REMIND_DAYS_BEFORE, SCHEDULE_HOUR);
  const askNow = now >= askAt;
  return { askNow, confirmRequest: askNow, dayBefore: now >= dayBeforeAt };
}
