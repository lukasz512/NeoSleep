import { appointmentResponseState, type Appointment, type AppointmentResponseState } from "../../composables/useAppointments";
import type { PlannerEvent } from "../../utils/encounterMapping";
import { deviceTimeZone, toZonedCalendarDateTime } from "../../utils/appointmentTime";
import { MINUTES_PER_DAY, parseWallTime } from "../../utils/calendarLayout";
import type { CalendarGridEvent } from "./calendarTypes";

type AppIconName = CalendarGridEvent["icon"];

/**
 * Appointment / event → calendar row (NEO-256). One mapping for the calendar
 * and for the patient card's Citas, so both lists look and change the same.
 */

export type CalendarItemKind = "encounter" | "appointment";

export interface CalendarEntry {
  kind: CalendarItemKind;
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  color: string;
  meta?: string;
  response?: AppointmentResponseState | null;
  encounter?: PlannerEvent;
  appointment?: Appointment;
}

/** Map event type+status to a warm/varied color for visual richness (encounters only). */
function encounterColor(type: "f2f" | "video", status: string): string {
  if (status === "cancelled") return "#9E9E9E";
  if (status === "completed") return "#4CAF50";
  if (status === "no_show") return "#FF7043";
  return type === "video" ? "#F59E0B" : "#128F83";
}

/** Status → tint, Apple Calendar-style (appointments only). */
const STATUS_TINT: Record<Appointment["status"], string> = { scheduled: "#128F83", completed: "#34C759", cancelled: "#8E8E93", no_show: "#FF9500" };

const RESPONSE_COLOR: Record<AppointmentResponseState, string> = {
  confirmed: "rgb(var(--v-theme-success))",
  cannot_attend: "rgb(var(--v-theme-warning))",
  awaiting: "rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity))",
};

/** `untitled` is the translated fallback for an event without a title. */
export function encounterEntry(encounter: PlannerEvent, untitled: string): CalendarEntry {
  return {
    kind: "encounter",
    id: encounter.id,
    title: encounter.title || untitled,
    start_at: encounter.start_at,
    end_at: encounter.end_at,
    timezone: deviceTimeZone(),
    status: encounter.status,
    color: encounterColor(encounter.type, encounter.status),
    meta: encounter.location || encounter.video_link || undefined,
    response: null,
    encounter,
  };
}

export function appointmentEntry(appointment: Appointment): CalendarEntry {
  return {
    kind: "appointment",
    id: appointment.id,
    title: appointment.patient_name ?? "",
    start_at: appointment.start_at,
    end_at: appointment.end_at,
    timezone: appointment.timezone,
    status: appointment.status,
    color: STATUS_TINT[appointment.status],
    meta: [appointment.practitioner_name, appointment.organization_name].filter(Boolean).join(" · "),
    response: appointmentResponseState(appointment),
    appointment,
  };
}

function kindIcon(kind: CalendarItemKind): AppIconName {
  return kind === "appointment" ? "nav-appointments" : "nav-planner";
}

function responseIcon(response: AppointmentResponseState): AppIconName {
  if (response === "awaiting") return "clock";
  return response === "confirmed" ? "check-circle" : "alert-triangle";
}

export function clockLabel(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** The row as the grids and day lists draw it, in the entry's own wall time (CORE-122). */
export function toGridEvent(e: CalendarEntry, now: number): CalendarGridEvent {
  const start = parseWallTime(toZonedCalendarDateTime(e.start_at, e.timezone));
  const end = parseWallTime(toZonedCalendarDateTime(e.end_at, e.timezone));
  // An entry running past midnight is drawn to the end of its first day.
  const endMin = Math.min(Math.max(end.key === start.key ? end.minutes : MINUTES_PER_DAY, start.minutes + 15), MINUTES_PER_DAY);
  // 24 h like the hour gutter: "11:30–12:15" fits a narrow week column or month cell, "11:30 a.m.–…" does not.
  const startLabel = clockLabel(start.minutes);
  return {
    id: e.id,
    title: e.title,
    dayKey: start.key,
    startMin: start.minutes,
    endMin,
    timeLabel: `${startLabel}–${clockLabel(endMin)}`,
    startLabel,
    meta: e.meta || undefined,
    color: e.color,
    status: e.status,
    icon: kindIcon(e.kind),
    responseIcon: e.response ? responseIcon(e.response) : undefined,
    responseColor: e.response ? RESPONSE_COLOR[e.response] : undefined,
    past: new Date(e.end_at).getTime() < now,
  };
}
