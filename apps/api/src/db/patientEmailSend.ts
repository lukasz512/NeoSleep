import type { PoolClient } from "pg";
import { EMAIL_STATUS_RANK, insertEmailSend, listEmailSends, type EmailSend, type EmailSendStatus } from "./emailSend.js";

/**
 * NEO-190 patient view of the shared email_send log (NEO-273): same rows,
 * recipient_type = 'patient', exposed with the patient_id the callers use.
 */
export type PatientEmailKind = "questionnaire_link" | "signed_copy" | "appointment" | "document_link";
export type PatientEmailStatus = EmailSendStatus;
export { EMAIL_STATUS_RANK };

export interface PatientEmailSend extends Omit<EmailSend, "recipient_type" | "recipient_id" | "kind"> {
  patient_id: string;
  kind: PatientEmailKind;
}

function toPatientSend(row: EmailSend): PatientEmailSend {
  const { recipient_type: _type, recipient_id, kind, ...rest } = row;
  return { ...rest, patient_id: recipient_id, kind: kind as PatientEmailKind };
}

export async function insertPatientEmailSend(
  client: PoolClient,
  input: {
    patientId: string;
    sentBy: string | null;
    kind: PatientEmailKind;
    questionnaireRequestId?: string | null;
    appointmentId?: string | null;
    sentToMasked: string;
    providerMessageId: string | null;
  }
): Promise<PatientEmailSend> {
  const { patientId, ...rest } = input;
  return toPatientSend(await insertEmailSend(client, { ...rest, recipientType: "patient", recipientId: patientId }));
}

export async function listPatientEmailSends(client: PoolClient, patientId: string, limit = 50): Promise<PatientEmailSend[]> {
  const rows = await listEmailSends(client, "patient", patientId, { limit });
  return rows.map(toPatientSend);
}
