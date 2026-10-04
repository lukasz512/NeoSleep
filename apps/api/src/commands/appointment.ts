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
  getIdentityIdForUser,
  isOnCareTeam,
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentUpdate,
} from "../db.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { notify } from "../notifications/notify.js";
import { timezoneForCountry, wallTimeToUtc } from "../utils/timezones.js";
import { assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";
import { getAppointmentViewer, assertCanSeeAppointment, redactForViewer, type AppointmentViewer, type AppointmentView } from "../queries/appointment.js";
import { planAppointmentPatientEmail, type AppointmentEffects } from "./appointmentPatient.js";
import { addCareTeamMember, releaseCareTeamAfterVisit } from "./careTeam.js";

/**
 * COMMANDS — Appointment domain (NEO-27, ADR-026).
 *
 * Booking rules (Łukasz, scoping form 2026-09-26):
 *   - staff book (admin, manager, doctor, rep/kam/msl); patients don't book in v1
 *   - a doctor books only their own patients (primary doctor or care team), always with themselves
 *   - booking with a doctor outside the care team adds them to it, confirmed by
 *     grant_access; cancelling or deleting that visit takes it back (CORE-132, careTeam.ts)
 *   - managers and the field force book patients inside their territories; admin books anyone
 *   - a booking is confirmed at once; the doctor gets an in-app notification when someone else booked
 *   - default length 60 minutes; clinic's time zone
 *   - completed / no_show: the doctor of the appointment, manager, admin
 *   - reschedule / cancel: those three plus whoever booked it
 *   - the patient is emailed on book / reschedule / cancel (CORE-25): pass
 *     `effects` and the route sends what it collects after the commit
 */

export const DEFAULT_DURATION_MINUTES = 60;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 8 * 60;

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

/**
 * The start instant: `start_local` is wall-clock time in the clinic's zone
 * (what the form shows), converted here so every viewer, the calendar and the
 * patient's email agree (CORE-120); `start_at` is an absolute instant for API
 * clients that already have one. Never both — they could disagree.
 */
function resolveStart(input: { start_at?: string; start_local?: string }, timeZone: string): Date | undefined {
  if (input.start_local !== undefined && input.start_at !== undefined) {
    throw new ValidationError("Send start_local or start_at, not both", "start_local");
  }
  if (input.start_local !== undefined) return new Date(wallTimeToUtc(input.start_local, timeZone));
  return input.start_at !== undefined ? parseInstant(input.start_at, "start_at") : undefined;
}

/** The clinic a booking happens at: the one sent, else the doctor's primary clinic, else their only one. */
async function resolveClinicId(ctx: TenantContext, organizationId: string | undefined, practitionerId: string | undefined): Promise<string | null> {
  if (organizationId) {
    if (!(await getOrganizationById(ctx.client, organizationId))) throw new NotFoundError("Organization", organizationId);
    return organizationId;
  }
  if (!practitionerId) return null;
  const affiliations = await getOrganizationAffiliations(ctx.client, practitionerId);
  const primary = affiliations.find((a) => a.is_primary);
  return primary?.organization_id ?? (affiliations.length === 1 ? affiliations[0]!.organization_id : null);
}

/** Clinic's country → zone, else the patient's country, else the tenant default. */
async function resolveTimezone(ctx: TenantContext, organizationId: string | null, patientRegion?: string | null): Promise<string> {
  if (organizationId) {
    const org = await getOrganizationById(ctx.client, organizationId);
    const zone = timezoneForCountry(org?.country_code);
    if (zone) return zone;
  }
  return timezoneForCountry(patientRegion) ?? getTenantDefaultTimezone(ctx.client);
}

/**
 * The zone a booking form shows times in before anything is saved — the same
 * resolution CreateAppointmentCommand uses (CORE-120).
 */
export async function GetBookingTimezoneQuery(
  ctx: TenantContext,
  input: { organization_id?: string; practitioner_id?: string; patient_id?: string },
): Promise<{ timezone: string; organization_id: string | null }> {
  const patient = input.patient_id ? await getPatientById(ctx.client, input.patient_id) : null;
  const organizationId = await resolveClinicId(ctx, input.organization_id, input.practitioner_id ?? patient?.practitioner_id ?? undefined);
  return { timezone: await resolveTimezone(ctx, organizationId, patient?.region), organization_id: organizationId };
}

function canCloseAppointments(viewer: AppointmentViewer): boolean {
  return viewer.kind !== "field";
}

async function notifyDoctor(ctx: TenantContext, appointment: Appointment, type: "appointment_booked" | "appointment_rescheduled" | "appointment_cancelled"): Promise<void> {
  const practitioner = await getPractitionerById(ctx.client, appointment.practitioner_id);
  if (!practitioner) return;
  // Copy, channels and link come from the event catalog (ADR-027); the doctor
  // is not told about a change they made themselves.
  await notify(ctx.client, {
    type,
    recipients: [practitioner.identity_id],
    entityId: appointment.id,
    meta: { start_at: appointment.start_at, timezone: appointment.timezone, patient_id: appointment.patient_id },
    actorIdentityId: await getIdentityIdForUser(ctx.client, ctx.user.id),
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
  /** Clinic wall-clock "YYYY-MM-DDTHH:mm" — the alternative to start_at (CORE-120). */
  start_local?: string;
  end_at?: string;
  duration_minutes?: number;
  notes?: string;
  sleep_study_id?: string;
  treatment_plan_id?: string;
  /** CORE-132 D4: the booker confirms that a doctor outside the care team gets the patient's record. */
  grant_access?: boolean;
}

export async function CreateAppointmentCommand(ctx: TenantContext, input: CreateAppointmentInput, effects?: AppointmentEffects): Promise<AppointmentView> {
  if (!input.patient_id) throw new ValidationError("patient_id is required");
  if (!input.start_at && !input.start_local) throw new ValidationError("start_local is required", "start_local");

  const viewer = await getAppointmentViewer(ctx);
  const patient = await getPatientById(ctx.client, input.patient_id);
  if (!patient) throw new NotFoundError("Patient", input.patient_id);

  let practitionerId = input.practitioner_id ?? patient.practitioner_id ?? undefined;
  if (viewer.kind === "doctor") {
    if (input.practitioner_id && input.practitioner_id !== viewer.practitionerId) {
      throw new ForbiddenError("A doctor can only book appointments with themselves");
    }
    if (!(await isOnCareTeam(ctx.client, patient.id, viewer.practitionerId!))) {
      throw new ForbiddenError("A doctor can only book their own patients");
    }
    practitionerId = viewer.practitionerId!;
  } else if (viewer.kind !== "admin") {
    await assertTerritoryAccessByTerritoryId(ctx, patient.territory_id);
  }
  if (!practitionerId) throw new ValidationError("practitioner_id is required (the patient has no assigned doctor)");
  const practitioner = await getPractitionerById(ctx.client, practitionerId);
  if (!practitioner) throw new NotFoundError("Practitioner", practitionerId);
  // CORE-132 D4: booking with an HCP outside the care team gives them the patient's record,
  // so the booker confirms it explicitly.
  const joinsCareTeam = !(await isOnCareTeam(ctx.client, patient.id, practitionerId));
  if (joinsCareTeam && input.grant_access !== true) {
    throw new ValidationError("grant_access must be confirmed: this doctor is not on the patient's care team yet", "grant_access");
  }

  if (viewer.kind === "field" && (input.notes || input.sleep_study_id || input.treatment_plan_id)) {
    throw new ForbiddenError("Notes and clinical links are for clinical staff only");
  }
  await assertClinicalLinks(ctx, patient.id, input.sleep_study_id, input.treatment_plan_id);

  const organizationId = await resolveClinicId(ctx, input.organization_id, practitionerId);
  const timezone = await resolveTimezone(ctx, organizationId, patient.region);
  const start = resolveStart(input, timezone)!;
  const end = resolveEnd(start, input.end_at, input.duration_minutes);

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
    timezone,
    notes: input.notes ?? null,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "Appointment",
    entity_id: appointment.id,
    entity_after: { patient_id: appointment.patient_id, practitioner_id: appointment.practitioner_id, start_at: appointment.start_at, end_at: appointment.end_at, status: appointment.status, timezone: appointment.timezone },
    request_id: ctx.requestId,
  });
  if (joinsCareTeam) {
    await addCareTeamMember(ctx, { patientId: patient.id, practitionerId, source: "appointment", appointmentId: appointment.id });
  }
  if (viewer.practitionerId !== appointment.practitioner_id) await notifyDoctor(ctx, appointment, "appointment_booked");
  if (effects) effects.patientEmails.push(await planAppointmentPatientEmail(ctx.client, appointment, "booked", ctx.user.id));

  return redactForViewer(viewer, appointment);
}

export interface UpdateAppointmentInput {
  start_at?: string;
  /** Wall-clock in the appointment's own zone (CORE-120). */
  start_local?: string;
  end_at?: string;
  duration_minutes?: number;
  status?: string;
  notes?: string | null;
  sleep_study_id?: string | null;
  treatment_plan_id?: string | null;
}

export async function UpdateAppointmentCommand(ctx: TenantContext, id: string, input: UpdateAppointmentInput, effects?: AppointmentEffects): Promise<AppointmentView> {
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
  if (input.start_at !== undefined || input.start_local !== undefined || input.end_at !== undefined || input.duration_minutes !== undefined) {
    const start = resolveStart(input, before.timezone) ?? new Date(before.start_at);
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
    entity_after: { start_at: after.start_at, end_at: after.end_at, status: after.status, timezone: after.timezone },
    request_id: ctx.requestId,
  });

  const change = after.status === "cancelled" && before.status !== "cancelled"
    ? "cancelled"
    : after.start_at !== before.start_at || after.end_at !== before.end_at ? "rescheduled" : null;
  // CORE-132 D2: a cancelled visit takes back the access it gave; reopening it gives it back.
  if (change === "cancelled") await releaseCareTeamAfterVisit(ctx, after.patient_id, after.practitioner_id);
  if (before.status === "cancelled" && after.status !== "cancelled" && !(await isOnCareTeam(ctx.client, after.patient_id, after.practitioner_id))) {
    await addCareTeamMember(ctx, { patientId: after.patient_id, practitionerId: after.practitioner_id, source: "appointment", appointmentId: after.id });
  }
  if (change && viewer.practitionerId !== after.practitioner_id) {
    await notifyDoctor(ctx, after, change === "cancelled" ? "appointment_cancelled" : "appointment_rescheduled");
  }
  // A reschedule of a cancelled appointment tells the patient nothing new.
  if (change && effects && (change === "cancelled" || after.status === "scheduled")) {
    effects.patientEmails.push(await planAppointmentPatientEmail(ctx.client, after, change, ctx.user.id));
  }

  const latest = change && effects ? await getAppointmentById(ctx.client, id) : after;
  return redactForViewer(viewer, latest ?? after);
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
    entity_before: { patient_id: existing.patient_id, practitioner_id: existing.practitioner_id, start_at: existing.start_at, status: existing.status, timezone: existing.timezone },
    request_id: ctx.requestId,
  });
  await releaseCareTeamAfterVisit(ctx, existing.patient_id, existing.practitioner_id);
}
