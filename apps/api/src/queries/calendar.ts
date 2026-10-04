import type { TenantContext } from "../context/TenantContext.js";
import { GetEncounterListQuery, type EncounterDto } from "./encounter.js";
import { GetAppointmentsQuery, type AppointmentView, type AppointmentViewer } from "./appointment.js";

/**
 * QUERY: calendar union (CORE-117) — one list of encounters + appointments
 * for the "Calendario" screen, which replaces the separate Planificador and
 * Citas screens/calendars.
 *
 * This is a thin merge over the two domains' own queries, not a new
 * visibility policy of its own:
 *   - encounters: whatever GetEncounterListQuery (queries/encounter.ts)
 *     decides the caller may see. CORE-106 fixes that function's scoping
 *     (today only "rep" is scoped to their own; CORE-106 adds doctor/kam/msl/
 *     manager/admin rules) — this union calls that exported function
 *     directly, so it inherits CORE-106's fix automatically once merged,
 *     with no change needed here.
 *   - appointments: whatever GetAppointmentsQuery (queries/appointment.ts)
 *     already decides (admin/manager/doctor/field scoping, NEO-27/ADR-026) —
 *     unchanged by this ticket.
 */

export interface GetCalendarListInput {
  start?: string;
  end?: string;
}

export type CalendarItemKind = "encounter" | "appointment";

export interface CalendarItem {
  kind: CalendarItemKind;
  id: string;
  start_at: string;
  end_at: string | null;
  /** The underlying encounter or appointment row, exactly as its own query/DTO returns it. */
  data: EncounterDto | AppointmentView;
}

export interface GetCalendarListResult {
  items: CalendarItem[];
  /** The appointment viewer kind, so the route can decide whether to audit the read (NEO-27). */
  appointmentViewer: AppointmentViewer;
}

export async function GetCalendarListQuery(ctx: TenantContext, input: GetCalendarListInput): Promise<GetCalendarListResult> {
  const [encounterResult, appointmentResult] = await Promise.all([
    GetEncounterListQuery(ctx, { start: input.start, end: input.end }),
    GetAppointmentsQuery(ctx, { start: input.start, end: input.end }),
  ]);

  const items: CalendarItem[] = [
    ...encounterResult.items.map((e): CalendarItem => ({ kind: "encounter", id: e.id, start_at: e.start_at, end_at: e.end_at, data: e })),
    ...appointmentResult.items.map((a): CalendarItem => ({ kind: "appointment", id: a.id, start_at: a.start_at, end_at: a.end_at, data: a })),
  ];
  // Chronological, so week/day/agenda views don't need to re-sort a mixed list.
  items.sort((a, b) => a.start_at.localeCompare(b.start_at));

  return { items, appointmentViewer: appointmentResult.viewer };
}
