import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog } from "../db.js";

/**
 * Every read of patient health data (GDPR Art. 9 / LFPDPPP sensitive data) —
 * sleep studies, questionnaires, the Estudios checklist, clinical documents —
 * leaves an audit_log `read` row: who, in which role, which patient, which view.
 *
 * NEO-83 (2026-09-26) opened the studies to managers, who are not clinicians,
 * so access has to be traceable (GDPR Art. 5(2) accountability, Art. 32).
 * Writes were already audited by their commands; this closes the read side.
 * `read` rows stay out of the History tab (getAuditLogForEntities skips them).
 *
 * Call it inside the same withTenant() callback, after the query succeeded —
 * a 403/404 must not be logged as an access.
 */
export async function AuditHealthDataReadCommand(
  ctx: TenantContext,
  entry: { entity_type: string; entity_id: string | null; patient_id?: string | null; view: string },
): Promise<void> {
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "read",
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    request_id: ctx.requestId,
    metadata: { view: entry.view, patient_id: entry.patient_id ?? null, role: ctx.user.role },
  });
}
