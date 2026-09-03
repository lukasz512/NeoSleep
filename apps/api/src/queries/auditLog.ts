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
      user_name: r.user_name,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_before: r.entity_before,
      entity_after: r.entity_after,
    })),
    lead_source: lead ? { source: lead.source, converted_at: lead.converted_at ? lead.converted_at.toISOString() : null } : null,
  };
}
