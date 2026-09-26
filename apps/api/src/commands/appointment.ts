import type { TenantContext } from "../context/TenantContext.js";
import {
  insertAppointment,
  updateAppointment,
  softDeleteAppointment,
  getAppointmentById,
  getPatientById,
  getPractitionerById,
  getOrganizationById,
  getOrganizationAffiliations,
  getSleepStudyById,
  getTreatmentPlanById,
  getTenantDefaultTimezone,
  insertAuditLog,
  insertNotification,
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentUpdate,
} from "../db.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";
import { getAppointmentViewer, assertCanSeeAppointment, redactForViewer, type AppointmentViewer, type AppointmentView } from "../queries/appointment.js";

/**
 * COMMANDS — Appointment domain (NEO-27, ADR-026).
 *
 * Booking rules (Łukasz, scoping form 2026-09-26):
 *   - staff book (admin, manager, doctor, rep/kam/msl); patients don't book in v1
 *   - a doctor books only their own patients (patient.practitioner_id), always with themselves
 *   - managers and the field force book patients inside their territories; admin books anyone
 *   - a booking is confirmed at once; the doctor gets an in-app notification when someone else booked
 *   - default length 60 minutes; clinic's time zone
 *   - completed / no_show: the doctor of the appointment, manager, admin
 *   - reschedule / cancel: those three plus whoever booked it
 */

export const DEFAULT_DURATION_MINUTES = 60;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 8 * 60;

/** Clinic country → IANA zone. v1 has one zone per market; MX's other zones come with per-clinic settings. */
const COUNTRY_TIMEZONES: Record<string, string> = {
  PL: "Europe/Warsaw",
  MX: "America/Mexico_City",
  TH: "Asia/Bangkok",
};

function parseInstant(value: string, field: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} must be an ISO date-time`);
  return d;
}

function resolveEnd(start: Date, endAt: string | undefined, durationMinutes: number | undefined): Date {
  const end = endAt
    ? parseInstant(endAt, "end_at")
    : new Date(start.getTime() + (durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000);
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    // Names the field the caller sent, so the form marks it (NEO-109) — the message leads with neither.
    throw new ValidationError(`An appointment must last between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes`, endAt ? "end_at" : "duration_minutes");
  }
  return end;
}

async function resolveTimezone(ctx: TenantContext, organizationId: string | null): Promise<string> {
  if (organizationId) {
    const org = await getOrganizationById(ctx.client, organizationId);
    const zone = org?.country_code ? COUNTRY_TIMEZONES[org.country_code.toUpperCase()] : undefined;
    if (zone) return zone;
  }
  return getTenantDefaultTimezone(ctx.client);
}

function canCloseAppointments(viewer: AppointmentViewer): boolean {
  return viewer.kind !== "field";
}

async function notifyDoctor(ctx: TenantContext, appointment: Appointment, type: "appointment_booked" | "appointment_rescheduled" | "appointment_cancelled"): Promise<void> {
  const practitioner = await getPractitionerById(ctx.client, appointment.practitioner_id);
  if (!practitioner) return;
  const titles = {
    appointment_booked: "New appointment booked",
    appointment_rescheduled: "Appointment rescheduled",
    appointment_cancelled: "Appointment cancelled",
  } as const;
  await insertNotification(ctx.client, {
    identity_id: practitioner.identity_id,
    type,
    title: titles[type],
    entity_type: "Appointment",
    entity_id: appointment.id,
    action_url: "/appointments",
    metadata: { start_at: appointment.start_at, timezone: appointment.timezone, patient_id: appointment.patient_id },
  });
}

async function assertClinicalLinks(ctx: TenantContext, patientId: string, sleepStudyId?: string | null, treatmentPlanId?: string | null): Promise<void> {
  if (sleepStudyId) {
    const study = await getSleepStudyById(ctx.client, sleepStudyId);
    if (!study || study.patient_id !== patientId) throw new ValidationError("sleep_study_id does not belong to this patient");
  }
  if (treatmentPlanId) {
    const plan = await getTreatmentPlanById(ctx.client, treatmentPlanId);
    if (!plan || plan.patient_id !== patientId) throw new ValidationError("treatment_plan_id does not belong to this patient");
  }
}

export interface CreateAppointmentInput {
  patient_id?: string;
  practitioner_id?: string;
  organization_id?: string;
  start_at?: string;
  end_at?: string;
  duration_minutes?: number;
  notes?: string;
  sleep_study_id?: string;
  treatment_plan_id?: string;
}

export async function CreateAppointmentCommand(ctx: TenantContext, input: CreateAppointmentInput): Promise<AppointmentView> {
  if (!input.patient_id) throw new ValidationError("patient_id is required");
  if (!input.start_at) throw new ValidationError("start_at is required");
  const start = parseInstant(input.start_at, "start_at");
  const end = resolveEnd(start, input.end_at, input.duration_minutes);

  const viewer = await getAppointmentViewer(ctx);
  const patient = await getPatientById(ctx.client, input.patient_id);
  if (!patient) throw new NotFoundError("Patient", input.patient_id);

  let practitionerId = input.practitioner_id ?? patient.practitioner_id ?? undefined;
  if (viewer.kind === "doctor") {
    if (input.practitioner_id && input.practitioner_id !== viewer.practitionerId) {
      throw new ForbiddenError("A doctor can only book appointments with themselves");
    }
    if (patient.practitioner_id !== viewer.practitionerId) {
      throw new ForbiddenError("A doctor can only book their own patients");
    }
    practitionerId = viewer.practitionerId!;
  } else if (viewer.kind !== "admin") {
    await assertTerritoryAccessByTerritoryId(ctx, patient.territory_id);
  }
  if (!practitionerId) throw new ValidationError("practitioner_id is required (the patient has no assigned doctor)");
  const practitioner = await getPractitionerById(ctx.client, practitionerId);
  if (!practitioner) throw new NotFoundError("Practitioner", practitionerId);

  if (viewer.kind === "field" && (input.notes || input.sleep_study_id || input.treatment_plan_id)) {
    throw new ForbiddenError("Notes and clinical links are for clinical staff only");
  }
  await assertClinicalLinks(ctx, patient.id, input.sleep_study_id, input.treatment_plan_id);

  let organizationId = input.organization_id ?? null;
  if (organizationId) {
    if (!(await getOrganizationById(ctx.client, organizationId))) throw new NotFoundError("Organization", organizationId);
  } else {
    const affiliations = await getOrganizationAffiliations(ctx.client, practitionerId);
    organizationId = affiliations.find((a) => a.is_primary)?.organization_id ?? null;
  }

  const appointment = await insertAppointment(ctx.client, {
    patient_id: patient.id,
    practitioner_id: practitionerId,
    organization_id: organizationId,
    territory_id: patient.territory_id,
    sleep_study_id: input.sleep_study_id ?? null,
    treatment_plan_id: input.treatment_plan_id ?? null,
    created_by_user_id: ctx.user.id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    timezone: await resolveTimezone(ctx, organizationId),
    notes: input.notes ?? null,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "Appointment",
    entity_id: appointment.id,
    entity_after: { patient_id: appointment.patient_id, practitioner_id: appointment.practitioner_id, start_at: appointment.start_at, end_at: appointment.end_at, status: appointment.status },
    request_id: ctx.requestId,
  });
  if (viewer.practitionerId !== appointment.practitioner_id) await notifyDoctor(ctx, appointment, "appointment_booked");

  return redactForViewer(viewer, appointment);
}

export interface UpdateAppointmentInput {
  start_at?: string;
  end_at?: string;
  duration_minutes?: number;
  status?: string;
  notes?: string | null;
  sleep_study_id?: string | null;
  treatment_plan_id?: string | null;
}

export async function UpdateAppointmentCommand(ctx: TenantContext, id: string, input: UpdateAppointmentInput): Promise<AppointmentView> {
  const before = await getAppointmentById(ctx.client, id);
  if (!before) throw new NotFoundError("Appointment", id);
  const viewer = await getAppointmentViewer(ctx);
  await assertCanSeeAppointment(ctx, viewer, before);

  const isBooker = before.created_by_user_id === ctx.user.id;
  if (viewer.kind === "field" && !isBooker) throw new ForbiddenError("Only whoever booked this appointment can change it");

  const status = input.status as AppointmentStatus | undefined;
  if (status !== undefined && !APPOINTMENT_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status '${input.status}' — expected one of ${APPOINTMENT_STATUSES.join(", ")}`);
  }
  if (status && status !== "cancelled" && !canCloseAppointments(viewer)) {
    throw new ForbiddenError("Only the doctor, a manager or an admin can mark an appointment completed or no-show");
  }
  const touchesClinical = input.notes !== undefined || input.sleep_study_id !== undefined || input.treatment_plan_id !== undefined;
  if (viewer.kind === "field" && touchesClinical) throw new ForbiddenError("Notes and clinical links are for clinical staff only");
  await assertClinicalLinks(ctx, before.patient_id, input.sleep_study_id, input.treatment_plan_id);

  const update: AppointmentUpdate = { status, notes: input.notes, sleep_study_id: input.sleep_study_id, treatment_plan_id: input.treatment_plan_id };
  if (input.start_at !== undefined || input.end_at !== undefined || input.duration_minutes !== undefined) {
    const start = parseInstant(input.start_at ?? before.start_at, "start_at");
    const keepLength = input.end_at === undefined && input.duration_minutes === undefined;
    const lengthMinutes = (new Date(before.end_at).getTime() - new Date(before.start_at).getTime()) / 60_000;
    const end = resolveEnd(start, input.end_at, keepLength ? lengthMinutes : input.duration_minutes);
    update.start_at = start.toISOString();
    update.end_at = end.toISOString();
  }

  const after = await updateAppointment(ctx.client, id, update);
  if (!after) throw new NotFoundError("Appointment", id);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "Appointment",
    entity_id: id,
    entity_before: { start_at: before.start_at, end_at: before.end_at, status: before.status },
    entity_after: { start_at: after.start_at, end_at: after.end_at, status: after.status },
    request_id: ctx.requestId,
  });

  if (viewer.practitionerId !== after.practitioner_id) {
    if (after.status === "cancelled" && before.status !== "cancelled") await notifyDoctor(ctx, after, "appointment_cancelled");
    else if (after.start_at !== before.start_at || after.end_at !== before.end_at) await notifyDoctor(ctx, after, "appointment_rescheduled");
  }

  return redactForViewer(viewer, after);
}

/** Soft delete for correcting mistakes (wrong patient, test data) — admin-only, enforced at the route. Cancelling is a status change. */
export async function DeleteAppointmentCommand(ctx: TenantContext, id: string): Promise<void> {
  const existing = await getAppointmentById(ctx.client, id);
  if (!existing) throw new NotFoundError("Appointment", id);
  await softDeleteAppointment(ctx.client, id);
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "delete",
    entity_type: "Appointment",
    entity_id: id,
    entity_before: { patient_id: existing.patient_id, practitioner_id: existing.practitioner_id, start_at: existing.start_at, status: existing.status },
    request_id: ctx.requestId,
  });
}
