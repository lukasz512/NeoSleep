import type { TenantContext } from "../context/TenantContext.js";
import {
  insertCareTeamMember,
  deleteCareTeamMember,
  deleteCareTeamMemberIfUntouched,
  listCareTeam,
  getPractitionerById,
  insertAuditLog,
  type CareTeamMember,
  type CareTeamRow,
  type CareTeamSource,
} from "../db.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { getViewer, requirePatientInScope } from "../queries/entityAccess.js";

/**
 * COMMANDS — patient care team (CORE-132, docs/stories/patient-care-team-booking-assigns-hcp.md).
 *
 * Decisions (care-team-r1):
 *   D1  a team member sees the whole record; the card lists who got access, when, how
 *   D2  a cancelled/deleted visit drops the HCP it added, unless they have another live
 *       visit with the patient or recorded something for them
 *   D3  admin and manager add and remove by hand; the field force only adds; doctors neither
 *   D4  booking with an HCP not on the team needs grant_access: true (appointment.ts)
 *   D5  the primary doctor is patient.practitioner_id; only an admin replaces it (patient.ts)
 * Every add and remove is an audit_log entry (entity_type PatientCareTeam).
 */

const AUDIT_ENTITY = "PatientCareTeam";

async function auditCareTeam(ctx: TenantContext, action: "create" | "delete", row: CareTeamRow, reason?: string): Promise<void> {
  const snapshot = { patient_id: row.patient_id, practitioner_id: row.practitioner_id, source: row.source, appointment_id: row.appointment_id };
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action,
    entity_type: AUDIT_ENTITY,
    entity_id: row.id,
    entity_before: action === "delete" ? snapshot : undefined,
    entity_after: action === "create" ? snapshot : undefined,
    metadata: reason ? { reason } : undefined,
    request_id: ctx.requestId,
  });
}

/** Adds without a permission check — callers (booking, primary change) have done theirs. No-op when already on the team. */
export async function addCareTeamMember(
  ctx: TenantContext,
  input: { patientId: string; practitionerId: string; source: CareTeamSource; appointmentId?: string | null }
): Promise<CareTeamRow | null> {
  const row = await insertCareTeamMember(ctx.client, {
    patient_id: input.patientId,
    practitioner_id: input.practitionerId,
    source: input.source,
    appointment_id: input.appointmentId ?? null,
    added_by_user_id: ctx.user.id,
  });
  if (row) await auditCareTeam(ctx, "create", row);
  return row;
}

/** D2: after a visit is cancelled or deleted. Returns true when the HCP left the team. */
export async function releaseCareTeamAfterVisit(ctx: TenantContext, patientId: string, practitionerId: string): Promise<boolean> {
  const row = await deleteCareTeamMemberIfUntouched(ctx.client, patientId, practitionerId);
  if (row) await auditCareTeam(ctx, "delete", row, "visit_cancelled");
  return row !== null;
}

export async function ListCareTeamQuery(ctx: TenantContext, patientId: string): Promise<CareTeamMember[]> {
  await requirePatientInScope(ctx, patientId);
  return listCareTeam(ctx.client, patientId);
}

/** D3: admin, manager and the field force add by hand; a doctor doesn't widen access to a patient. */
export async function AddCareTeamMemberCommand(ctx: TenantContext, patientId: string, practitionerId: string | undefined): Promise<CareTeamMember[]> {
  if (!practitionerId?.trim()) throw new ValidationError("practitioner_id is required", "practitioner_id");
  const viewer = await getViewer(ctx);
  if (viewer.kind === "doctor") throw new ForbiddenError("A doctor cannot add others to a patient's care team");
  const patient = await requirePatientInScope(ctx, patientId);
  const practitioner = await getPractitionerById(ctx.client, practitionerId);
  if (!practitioner) throw new NotFoundError("Practitioner", practitionerId);
  if (patient.practitioner_id !== practitionerId) {
    await addCareTeamMember(ctx, { patientId, practitionerId, source: "manual" });
  }
  return listCareTeam(ctx.client, patientId);
}

/** D3: admin and manager only. The primary doctor is changed, not removed (D5). */
export async function RemoveCareTeamMemberCommand(ctx: TenantContext, patientId: string, practitionerId: string): Promise<CareTeamMember[]> {
  const viewer = await getViewer(ctx);
  if (viewer.kind !== "admin" && viewer.kind !== "manager") {
    throw new ForbiddenError("Only an admin or a manager can remove someone from a patient's care team");
  }
  const patient = await requirePatientInScope(ctx, patientId);
  if (patient.practitioner_id === practitionerId) {
    throw new ValidationError("The primary doctor can't be removed; an admin can change them on the patient card", "practitioner_id");
  }
  const row = await deleteCareTeamMember(ctx.client, patientId, practitionerId);
  if (!row) throw new NotFoundError("Care team member", practitionerId);
  await auditCareTeam(ctx, "delete", row, "manual");
  return listCareTeam(ctx.client, patientId);
}
