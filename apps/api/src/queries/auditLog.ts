import type { TenantContext } from "../context/TenantContext.js";
import { getAuditLogForEntities, getSleepStudiesPaginated, getTreatmentPlansPaginated, findLeadConvertedToPatient } from "../db.js";

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
  Patient: ["id", "status", "region"],
  SleepStudy: ["patient_id", "status"],
  TreatmentPlan: ["patient_id", "type", "status"],
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
  // Sleep studies and treatment plans linked to this patient — no pagination
  // limit needed here since a patient realistically has a handful of each,
  // not thousands.
  const [studies, plans, lead] = await Promise.all([
    getSleepStudiesPaginated(ctx.client, { patient_id: patientId }, 1, 500),
    getTreatmentPlansPaginated(ctx.client, { patient_id: patientId }, 1, 500),
    findLeadConvertedToPatient(ctx.client, patientId),
  ]);

  const entityTypes = ["Patient", "SleepStudy", "TreatmentPlan"];
  const entityIds = [patientId, ...studies.rows.map((s) => s.id), ...plans.rows.map((p) => p.id)];

  const rows = await getAuditLogForEntities(ctx.client, entityTypes, entityIds);

  return {
    entries: rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      user_id: r.user_id,
      user_name: r.user_name,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_before: redactAuditFields(r.entity_type, r.entity_before),
      entity_after: redactAuditFields(r.entity_type, r.entity_after),
    })),
    lead_source: lead ? { source: lead.source, converted_at: lead.converted_at ? lead.converted_at.toISOString() : null } : null,
  };
}
