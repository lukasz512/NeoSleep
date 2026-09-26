import type { TenantContext } from "../context/TenantContext.js";
import { getAppointments, getAppointmentById, getIdentityIdForUser, getPractitionerIdByIdentityId, type Appointment } from "../db.js";
import { ForbiddenError, NotFoundError } from "../errors.js";
import { getAllowedScopePaths, assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";

/**
 * QUERIES — Appointment domain (NEO-27, ADR-026).
 *
 * Who sees what (Łukasz, scoping form 2026-09-26):
 *   admin               everything
 *   manager             appointments in their territories
 *   doctor              only their own (appointment.practitioner_id = their practitioner row)
 *   rep / kam / msl     appointments in their territories, but without notes or clinical links
 *                       (no health data for the commercial field force, same line as NEO-36/83)
 */

export type AppointmentViewerKind = "admin" | "manager" | "doctor" | "field";

export interface AppointmentViewer {
  kind: AppointmentViewerKind;
  /** The doctor's own practitioner id (doctor only). */
  practitionerId: string | null;
  /** null = unrestricted. */
  scopePaths: string[] | null;
}

/** Appointment as a rep/KAM/MSL receives it: when, who, where — nothing clinical. */
export type AppointmentView = Appointment | (Omit<Appointment, "notes" | "sleep_study_id" | "treatment_plan_id"> & {
  notes: null;
  sleep_study_id: null;
  treatment_plan_id: null;
});

export async function getAppointmentViewer(ctx: TenantContext): Promise<AppointmentViewer> {
  const role = ctx.user.role;
  if (role === "admin") return { kind: "admin", practitionerId: null, scopePaths: null };
  if (role === "doctor") {
    const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
    const practitionerId = identityId ? await getPractitionerIdByIdentityId(ctx.client, identityId) : null;
    if (!practitionerId) throw new ForbiddenError("This doctor account is not linked to a practitioner record");
    return { kind: "doctor", practitionerId, scopePaths: null };
  }
  const scopePaths = await getAllowedScopePaths(ctx.client, ctx.user.roles);
  return { kind: role === "manager" ? "manager" : "field", practitionerId: null, scopePaths };
}

export function redactForViewer(viewer: AppointmentViewer, appointment: Appointment): AppointmentView {
  if (viewer.kind !== "field") return appointment;
  return { ...appointment, notes: null, sleep_study_id: null, treatment_plan_id: null };
}

/** Throws 403 when the viewer may not see this appointment at all. */
export async function assertCanSeeAppointment(ctx: TenantContext, viewer: AppointmentViewer, appointment: Appointment): Promise<void> {
  if (viewer.kind === "admin") return;
  if (viewer.kind === "doctor") {
    if (appointment.practitioner_id !== viewer.practitionerId) throw new ForbiddenError("This appointment belongs to another doctor");
    return;
  }
  await assertTerritoryAccessByTerritoryId(ctx, appointment.territory_id);
}

export interface GetAppointmentsInput {
  start?: string;
  end?: string;
  patient_id?: string;
  practitioner_id?: string;
}

export async function GetAppointmentsQuery(ctx: TenantContext, input: GetAppointmentsInput): Promise<{ viewer: AppointmentViewer; items: AppointmentView[] }> {
  const viewer = await getAppointmentViewer(ctx);
  const rows = await getAppointments(ctx.client, {
    ...input,
    // A doctor's list is always their own, whatever practitioner_id the client sent.
    practitioner_id: viewer.kind === "doctor" ? viewer.practitionerId! : input.practitioner_id,
    scope_paths: viewer.scopePaths,
  });
  return { viewer, items: rows.map((a) => redactForViewer(viewer, a)) };
}

export async function GetAppointmentByIdQuery(ctx: TenantContext, id: string): Promise<AppointmentView> {
  const appointment = await getAppointmentById(ctx.client, id);
  if (!appointment) throw new NotFoundError("Appointment", id);
  const viewer = await getAppointmentViewer(ctx);
  await assertCanSeeAppointment(ctx, viewer, appointment);
  return redactForViewer(viewer, appointment);
}
