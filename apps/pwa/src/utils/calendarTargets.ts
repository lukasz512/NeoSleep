/**
 * CORE-116 P3 — "add to my calendar" after the patient confirms. No single link
 * works everywhere: an .ics file opens Apple Calendar, Samsung / most Android
 * calendar apps and Outlook; the Google Calendar app only takes its own link.
 * So the page shows one big button for the likely calendar and the rest below.
 */
export type CalendarTargetKind = "ics" | "google" | "outlook";

export interface CalendarTarget {
  kind: CalendarTargetKind;
  labelKey: string;
  hintKey?: string;
}

const GOOGLE: CalendarTarget = { kind: "google", labelKey: "publicAppointment.calendarGoogle" };
const OUTLOOK: CalendarTarget = { kind: "outlook", labelKey: "publicAppointment.calendarOutlook" };
const ICS_FILE: CalendarTarget = { kind: "ics", labelKey: "publicAppointment.calendarFile" };

export function calendarTargets(userAgent: string): { primary: CalendarTarget; others: CalendarTarget[] } {
  // iPadOS reports a Mac user agent; both open .ics straight into Apple Calendar.
  if (/iPhone|iPad|iPod|Macintosh/i.test(userAgent)) {
    return { primary: { kind: "ics", labelKey: "publicAppointment.calendarApple" }, others: [GOOGLE, OUTLOOK] };
  }
  if (/Android/i.test(userAgent)) {
    return {
      primary: { kind: "ics", labelKey: "publicAppointment.calendarPhone", hintKey: "publicAppointment.calendarPhoneHint" },
      others: [GOOGLE, OUTLOOK],
    };
  }
  return { primary: GOOGLE, others: [OUTLOOK, ICS_FILE] };
}
