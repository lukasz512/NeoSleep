import type { TenantContext } from "../context/TenantContext.js";
import { getAuditLogForEntities, findLeadConvertedToPatient } from "../db.js";
import { getPatientTimeline, getPractitionerTimeline } from "../db/audit-log.js";
import { requirePatientInScope, requirePractitionerInScope, requireOrganizationInScope } from "./entityAccess.js";

/**
 * QUERY — Patient history.
 *
 * Composes audit_log entries for a patient + their sleep studies + treatment
 * plans into one timeline, plus a synthetic "originally referred as a lead"
 * entry when applicable. Read-only, no writes.
 */

export interface PatientHistoryEntryDto {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_before: Record<string, unknown> | null;
  entity_after: Record<string, unknown> | null;
  /** "patient" when the patient did it from a link (confirm, can't come, signed consent); null = user_name or the system. */
  actor: "patient" | null;
}

export interface PatientHistoryDto {
  entries: PatientHistoryEntryDto[];
  lead_source: { source: string | null; converted_at: string | null } | null;
}

/**
 * PatientHistoryPanel.vue renders entity_before/entity_after directly to
 * every staff role that can open a patient's History tab (rep included) —
 * this JSONB was previously an internal-only compliance artifact, never
 * shown to a user. The commands that write it today (patient.ts,
 * sleepStudy.ts, treatmentPlan.ts) all use narrow, non-clinical field sets —
 * but nothing enforces that going forward, and sleep_study/treatment_plan
 * both have real clinical columns (diagnosis_code, interpretation,
 * medical_record) that would silently start rendering to reps if a future
 * command widened what it writes to entity_before/entity_after. This
 * allow-list is the enforcement point: fields not listed here for a given
 * entity_type are dropped before the DTO leaves this query, regardless of
 * what's actually stored in the audit_log row. Unknown entity_type → no
 * fields at all (fail safe, not fail open).
 */
const AUDIT_FIELD_ALLOWLIST: Record<string, readonly string[]> = {
  // `practitioner` is the doctor's name the timeline query adds for practitioner_id (CORE-160); the raw id stays out.
  // `appointment_emails` = the patient stopped appointment emails from the link.
  Patient: ["id", "status", "region", "practitioner", "appointment_emails"],
  SleepStudy: ["patient_id", "status"],
  TreatmentPlan: ["patient_id", "type", "status"],
  Practitioner: ["id", "primary_specialty", "region", "status"],
  Organization: ["id", "name", "type", "status", "region"],
  // CORE-133: when, and what state — never notes or clinical links. `channel`/`kind` say which email went out.
  // CORE-160: `patient_response` = the patient's "confirm" / "can't come" from the email.
  Appointment: ["start_at", "end_at", "timezone", "status", "channel", "kind", "patient_response"],
  Encounter: ["type", "status", "start_at"],
  QuestionnaireRequest: ["items", "status", "expires_at"],
  // CORE-160: what was signed, uploaded or who joined the team — never answers, scores or exam findings.
  PatientCareTeam: ["practitioner", "source"],
  Consent: ["purpose"],
  FileAttachment: ["document_type", "title"],
};

function redactAuditFields(
  entityType: string,
  fields: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!fields) return null;
  const allowed = AUDIT_FIELD_ALLOWLIST[entityType] ?? [];
  const redacted: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) redacted[key] = fields[key];
  }
  return Object.keys(redacted).length > 0 ? redacted : null;
}

export async function GetHistoryForPatientQuery(ctx: TenantContext, patientId: string): Promise<PatientHistoryDto> {
  await requirePatientInScope(ctx, patientId);
  // Sequential, not Promise.all: one PoolClient runs one query at a time anyway.
  const rows = await getPatientTimeline(ctx.client, patientId);
  const lead = await findLeadConvertedToPatient(ctx.client, patientId);

  return {
    entries: toEntries(rows),
    lead_source: lead ? { source: lead.source, converted_at: lead.converted_at ? lead.converted_at.toISOString() : null } : null,
  };
}

export interface EntityHistoryDto {
  entries: PatientHistoryEntryDto[];
}

/**
 * A comment on a device order is stored as a PartnerOrder "create" whose
 * entity_after.action says add_comment; it must not read as a second order.
 */
function displayAction(entityType: string, action: string, after: Record<string, unknown> | null): string {
  return entityType === "PartnerOrder" && action === "create" && after?.action === "add_comment" ? "comment" : action;
}

function toEntries(rows: Awaited<ReturnType<typeof getAuditLogForEntities>>): PatientHistoryEntryDto[] {
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    user_id: r.user_id,
    user_name: r.user_name,
    action: displayAction(r.entity_type, r.action, r.entity_after),
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    entity_before: redactAuditFields(r.entity_type, r.entity_before),
    entity_after: redactAuditFields(r.entity_type, r.entity_after),
    actor: r.actor === "patient" ? "patient" : null,
  }));
}

/** The doctor's own record plus their appointments and encounters (CORE-133). */
export async function GetHistoryForPractitionerQuery(ctx: TenantContext, practitionerId: string): Promise<EntityHistoryDto> {
  await requirePractitionerInScope(ctx, practitionerId);
  const rows = await getPractitionerTimeline(ctx.client, practitionerId);
  return { entries: toEntries(rows) };
}

export async function GetHistoryForOrganizationQuery(ctx: TenantContext, organizationId: string): Promise<EntityHistoryDto> {
  await requireOrganizationInScope(ctx, organizationId);
  const rows = await getAuditLogForEntities(ctx.client, ["Organization"], [organizationId]);
  return { entries: toEntries(rows) };
}
