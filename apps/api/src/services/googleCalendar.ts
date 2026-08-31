import { google } from "googleapis";
import {
  GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  GOOGLE_CALENDAR_REFRESH_TOKEN,
  GOOGLE_CALENDAR_ID,
  GOOGLE_CALENDAR_EXTRA_ATTENDEES,
} from "../env.js";
import { PartnerServiceError, ConflictError, ValidationError } from "../errors.js";

/**
 * Public "book a call" widget on neosleepcare.com/for-professionals, backed
 * by a single personal Gmail calendar (neosleepcare@gmail.com — not Google
 * Workspace, so no built-in "Appointment schedule" page). We generate slots
 * and book events ourselves via OAuth2 + a stored refresh token; Google's own
 * `sendUpdates: "all"` on event creation puts a real invite (with a Meet
 * link) on every attendee's calendar. Our own branded confirmation emails
 * (see routes/booking.ts) are sent separately — Google never emails the
 * organizer their own event, so that side needs its own notification.
 */

const SLOT_MINUTES = 30;
const BUSINESS_START_HOUR = 10;
const BUSINESS_END_HOUR = 20;
const TIMEZONE = "Europe/Warsaw"; // CET/CEST
const MIN_LEAD_TIME_DAYS = 1; // earliest bookable slot is 1 calendar day from now
const MAX_BOOKING_HORIZON_MONTHS = 2; // latest bookable slot is 2 months from now
const DEFAULT_WINDOW_DAYS = 30;

export interface Slot {
  start: string; // ISO
  end: string; // ISO
}

export interface SlotWithAvailability extends Slot {
  /** false = within business hours but already booked — shown greyed out, not omitted, so the calendar reads as a real day view. */
  available: boolean;
}

function isConfigured(): boolean {
  return !!(GOOGLE_CALENDAR_CLIENT_ID && GOOGLE_CALENDAR_CLIENT_SECRET && GOOGLE_CALENDAR_REFRESH_TOKEN);
}

function getCalendarClient() {
  if (!isConfigured()) {
    throw new PartnerServiceError(
      "google-calendar",
      "GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET / GOOGLE_CALENDAR_REFRESH_TOKEN not configured"
    );
  }
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_CALENDAR_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/** Offset (minutes, UTC -> timeZone) of `timeZone` at the instant `date` — via Intl, no date library needed. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date);
  const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
}

/**
 * Converts a wall-clock time in `timeZone` to a UTC Date. Approximate across
 * a DST transition (offset is resolved from a same-day UTC guess, not the
 * final instant) — fine at 30-minute slot granularity, not meant for exact
 * instants right at a DST boundary.
 */
function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMin = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMin * 60_000);
}

function isBusinessDay(date: Date, timeZone: string): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return weekday !== "Sat" && weekday !== "Sun";
}

function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** [earliestStart, latestStart] a slot may start at, relative to now — enforced both when listing slots and when booking one (bookSlot never trusts the client to only submit an in-range slot). */
function bookingWindow(now: Date): { earliestStart: number; latestStart: number } {
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + MAX_BOOKING_HORIZON_MONTHS);
  return {
    earliestStart: now.getTime() + MIN_LEAD_TIME_DAYS * 24 * 60 * 60_000,
    latestStart: horizon.getTime(),
  };
}

/**
 * All candidate 30-min slots across the next `days` business days (weekends
 * skipped, so the scan window is wider than `days` calendar days), before
 * filtering against freebusy. Always bounded by bookingWindow() regardless
 * of how large `days` is.
 */
function candidateSlots(days: number): Slot[] {
  const slots: Slot[] = [];
  const now = new Date();
  const maxDayOffset = days * 2 + 14; // safety valve so a bad `days` value can't loop forever
  const { earliestStart, latestStart } = bookingWindow(now);

  let businessDaysFound = 0;
  for (let dayOffset = 0; businessDaysFound < days && dayOffset < maxDayOffset; dayOffset++) {
    const cursor = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    if (!isBusinessDay(cursor, TIMEZONE)) continue;
    businessDaysFound++;

    const { year, month, day } = localDateParts(cursor, TIMEZONE);
    const dayStart = zonedWallTimeToUtc(year, month, day, BUSINESS_START_HOUR, 0, TIMEZONE);
    if (dayStart.getTime() > latestStart) break; // days only move forward — nothing past this can be in range either
    const dayEnd = zonedWallTimeToUtc(year, month, day, BUSINESS_END_HOUR, 0, TIMEZONE);

    for (let t = dayStart.getTime(); t + SLOT_MINUTES * 60_000 <= dayEnd.getTime(); t += SLOT_MINUTES * 60_000) {
      slots.push({ start: new Date(t).toISOString(), end: new Date(t + SLOT_MINUTES * 60_000).toISOString() });
    }
  }

  return slots.filter((s) => {
    const start = new Date(s.start).getTime();
    return start >= earliestStart && start <= latestStart;
  });
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** All candidate slots in the bookable window, each flagged available/unavailable — the frontend renders unavailable ones greyed out rather than hiding them. */
export async function getSlots({ days = DEFAULT_WINDOW_DAYS }: { days?: number } = {}): Promise<SlotWithAvailability[]> {
  const calendar = getCalendarClient();
  const candidates = candidateSlots(days);
  if (candidates.length === 0) return [];

  const timeMin = candidates[0]!.start;
  const timeMax = candidates[candidates.length - 1]!.end;

  const freebusy = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: [{ id: GOOGLE_CALENDAR_ID }] },
  });
  const busy = freebusy.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy ?? [];

  return candidates.map((slot) => {
    const slotStart = new Date(slot.start).getTime();
    const slotEnd = new Date(slot.end).getTime();
    const isBusy = busy.some((b) => overlaps(slotStart, slotEnd, new Date(b.start!).getTime(), new Date(b.end!).getTime()));
    return { ...slot, available: !isBusy };
  });
}

export interface BookSlotInput {
  start: string;
  end: string;
  name: string;
  email: string;
}

export async function bookSlot(input: BookSlotInput): Promise<{ start: string; end: string; meetLink?: string }> {
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
    throw new ValidationError("Invalid start/end time");
  }
  if (!input.name?.trim()) throw new ValidationError("name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email ?? "")) throw new ValidationError("Invalid email format");

  // Defense in depth — never trust the client to only submit a slot that was
  // actually in the list it was shown (min 1 day out, max 2 months out).
  const { earliestStart, latestStart } = bookingWindow(new Date());
  if (start.getTime() < earliestStart || start.getTime() > latestStart) {
    throw new ValidationError("This slot is outside the bookable window");
  }

  const calendar = getCalendarClient();

  // Re-check freebusy right before booking — closes the gap between the slot
  // list the visitor loaded and the moment they submit (another visitor could
  // have taken it in between).
  const freebusy = await calendar.freebusy.query({
    requestBody: { timeMin: input.start, timeMax: input.end, items: [{ id: GOOGLE_CALENDAR_ID }] },
  });
  const busy = freebusy.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy ?? [];
  if (busy.length > 0) {
    throw new ConflictError("This slot was just booked — please pick another one");
  }

  const event = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: `NeoSleep partnership call — ${input.name.trim()}`,
      start: { dateTime: input.start, timeZone: TIMEZONE },
      end: { dateTime: input.end, timeZone: TIMEZONE },
      attendees: [
        { email: input.email.trim(), displayName: input.name.trim() },
        ...GOOGLE_CALENDAR_EXTRA_ATTENDEES.map((email) => ({ email })),
      ],
      conferenceData: {
        createRequest: { requestId: `neosleep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      },
    },
  });

  const meetLink =
    event.data.hangoutLink ??
    event.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    undefined;

  return { start: input.start, end: input.end, meetLink };
}
