import { offsetMinutes, utcToWallTime } from "./timezones.js";

/**
 * iCalendar (RFC 5545) file for an appointment email (CORE-26).
 *
 * One stable UID per appointment: a reschedule sends the same UID with a
 * higher SEQUENCE and the patient's calendar app moves the entry; a
 * cancellation sends METHOD:CANCEL and the entry goes away. No library —
 * one VEVENT is a few lines, and the escaping/folding rules are tested.
 *
 * CORE-244: the times are the clinic's wall clock with its TZID, so the
 * calendar entry keeps the clinic's zone; the instant is the same as in UTC.
 */

export interface AppointmentIcsInput {
  appointmentId: string;
  /** Must grow with every change of the same appointment. */
  sequence: number;
  method: "REQUEST" | "CANCEL";
  startAt: string;
  endAt: string;
  /** IANA zone of the clinic. */
  timezone: string;
  summary: string;
  location: string | null;
  description: string | null;
  organizer: { name: string; email: string };
  attendeeEmail: string;
}

export function appointmentIcsUid(appointmentId: string): string {
  return `appointment-${appointmentId}@neosleepcare.com`;
}

/** 2031-01-15T15:00:00.000Z → 20310115T150000Z */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 2031-01-15T15:00:00.000Z in America/Mexico_City → 20310115T090000 */
function wallStamp(iso: string, timeZone: string): string {
  return `${utcToWallTime(iso, timeZone).replace(/[-:]/g, "")}00`;
}

/** -360 → -0600 */
function offsetStamp(minutes: number): string {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
}

/**
 * A one-rule VTIMEZONE: the offset in force when the visit starts. Enough for
 * a single, non-repeating event; calendar apps that know the IANA name use
 * their own rules anyway.
 */
function vtimezone(startAt: string, timeZone: string): string[] {
  const offset = offsetStamp(offsetMinutes(new Date(startAt).getTime(), timeZone));
  return ["BEGIN:VTIMEZONE", `TZID:${timeZone}`, "BEGIN:STANDARD", "DTSTART:19700101T000000", `TZOFFSETFROM:${offset}`, `TZOFFSETTO:${offset}`, "END:STANDARD", "END:VTIMEZONE"];
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Parameter values (CN) are quoted; quotes and line breaks can't appear inside. */
function quoteParam(value: string): string {
  return `"${value.replace(/["\r\n]/g, " ")}"`;
}

/** Lines longer than 75 octets continue on the next line after CRLF + space, never splitting a UTF-8 character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let limit = 75;
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > limit) {
      parts.push(current);
      current = "";
      limit = 74; // the leading space of a continuation line counts
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildAppointmentIcs(input: AppointmentIcsInput): string {
  const cancelled = input.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NeoSleep//Appointments//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    ...vtimezone(input.startAt, input.timezone),
    "BEGIN:VEVENT",
    `UID:${appointmentIcsUid(input.appointmentId)}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART;TZID=${input.timezone}:${wallStamp(input.startAt, input.timezone)}`,
    `DTEND;TZID=${input.timezone}:${wallStamp(input.endAt, input.timezone)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    `ORGANIZER;CN=${quoteParam(input.organizer.name)}:mailto:${input.organizer.email}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? "DECLINED" : "ACCEPTED"};RSVP=FALSE:mailto:${input.attendeeEmail}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

type CalendarLinkInput = Pick<AppointmentIcsInput, "startAt" | "endAt" | "timezone" | "summary" | "location" | "description">;

/** "Add to Google Calendar" — a fallback for inboxes that hide the attachment. */
export function googleCalendarLink(input: CalendarLinkInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.summary,
    dates: `${utcStamp(input.startAt)}/${utcStamp(input.endAt)}`,
    ctz: input.timezone,
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { details: input.description } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** "Add to Outlook" (outlook.com / Microsoft 365 web). */
export function outlookCalendarLink(input: CalendarLinkInput): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: input.summary,
    startdt: new Date(input.startAt).toISOString(),
    enddt: new Date(input.endAt).toISOString(),
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { body: input.description } : {}),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
