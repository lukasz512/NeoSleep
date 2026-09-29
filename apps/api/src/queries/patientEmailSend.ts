import type { TenantContext } from "../context/TenantContext.js";
import { requirePatientInScope } from "./entityAccess.js";
import { listPatientEmailSends, type PatientEmailSend } from "../db/patientEmailSend.js";

export type PatientEmailSendView = Pick<
  PatientEmailSend,
  "id" | "kind" | "sent_to_masked" | "status" | "status_detail" | "status_at" | "created_at" | "questionnaire_request_id"
>;

/**
 * The patient's email history behind the territory guard. No health data
 * and only masked addresses, so — like the QR link status — no audit_log
 * 'read' row (NEO-190).
 */
export async function GetPatientEmailSendsQuery(ctx: TenantContext, patientId: string): Promise<PatientEmailSendView[]> {
  await requirePatientInScope(ctx, patientId);
  const rows = await listPatientEmailSends(ctx.client, patientId);
  return rows.map(({ id, kind, sent_to_masked, status, status_detail, status_at, created_at, questionnaire_request_id }) => ({
    id,
    kind,
    sent_to_masked,
    status,
    status_detail,
    status_at,
    created_at,
    questionnaire_request_id,
  }));
}
