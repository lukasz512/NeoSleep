import type { TenantContext } from "../context/TenantContext.js";
import { requirePatientInScope } from "./entityAccess.js";
import { listPatientEmailSends, type PatientEmailSend } from "../db/patientEmailSend.js";
import { getPatientPdfContext } from "../db/patientPdfContext.js";
import { maskEmail } from "../utils/maskEmail.js";
import { patientEmailLocale } from "../utils/patientEmailLocale.js";

export type PatientEmailSendView = Pick<
  PatientEmailSend,
  "id" | "kind" | "sent_to_masked" | "status" | "status_detail" | "status_at" | "created_at" | "questionnaire_request_id"
>;

/**
 * The patient's email history behind the territory guard. No health data
 * and only masked addresses, so — like the QR link status — no audit_log
 * 'read' row (NEO-190). `recipient` is where the next email would go
 * (masked), or null when the record has no email (NEO-192).
 */
export async function GetPatientEmailSendsQuery(
  ctx: TenantContext,
  patientId: string
): Promise<{ recipient: string | null; language: string; sends: PatientEmailSendView[] }> {
  await requirePatientInScope(ctx, patientId);
  const context = await getPatientPdfContext(ctx.client, patientId, ctx.user.id);
  const email = context?.patient_email?.trim();
  const rows = await listPatientEmailSends(ctx.client, patientId);
  const sends = rows.map(({ id, kind, sent_to_masked, status, status_detail, status_at, created_at, questionnaire_request_id }) => ({
    id,
    kind,
    sent_to_masked,
    status,
    status_detail,
    status_at,
    created_at,
    questionnaire_request_id,
  }));
  // CORE-268: the send dialog preselects the recipient's mail language.
  const language = patientEmailLocale(context?.patient_language ?? null, context?.patient_region ?? null);
  return { recipient: email ? maskEmail(email) : null, language, sends };
}
