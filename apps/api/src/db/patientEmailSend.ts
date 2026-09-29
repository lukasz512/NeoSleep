import type { PoolClient } from "pg";

/**
 * NEO-190: what happened to each email the app sent a patient. The row is
 * written when Resend accepts the email; Resend's webhook then moves `status`
 * forward (routes/webhooks.ts). No health data, no full address, no link.
 */
export type PatientEmailKind = "questionnaire_link" | "signed_copy";
export type PatientEmailStatus = "sent" | "delayed" | "delivered" | "bounced" | "failed" | "suppressed" | "complained";

export interface PatientEmailSend {
  id: string;
  patient_id: string;
  sent_by: string | null;
  kind: PatientEmailKind;
  questionnaire_request_id: string | null;
  sent_to_masked: string;
  provider_message_id: string | null;
  status: PatientEmailStatus;
  status_detail: string | null;
  status_at: Date | null;
  created_at: Date;
}

/**
 * Webhooks can arrive late or out of order (a "delayed" after "delivered").
 * A status only replaces one of a lower rank, so the row never moves back.
 * A spam complaint outranks everything: it can follow a delivery.
 */
export const EMAIL_STATUS_RANK: Record<PatientEmailStatus, number> = {
  sent: 0,
  delayed: 1,
  delivered: 2,
  bounced: 3,
  failed: 3,
  suppressed: 3,
  complained: 4,
};

export async function insertPatientEmailSend(
  client: PoolClient,
  input: {
    patientId: string;
    sentBy: string | null;
    kind: PatientEmailKind;
    questionnaireRequestId?: string | null;
    sentToMasked: string;
    providerMessageId: string | null;
  }
): Promise<PatientEmailSend> {
  const { rows } = await client.query<PatientEmailSend>(
    `INSERT INTO patient_email_send (patient_id, sent_by, kind, questionnaire_request_id, sent_to_masked, provider_message_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.patientId, input.sentBy, input.kind, input.questionnaireRequestId ?? null, input.sentToMasked, input.providerMessageId]
  );
  return rows[0]!;
}

export async function patientEmailSendExists(client: PoolClient, providerMessageId: string): Promise<boolean> {
  const { rowCount } = await client.query("SELECT 1 FROM patient_email_send WHERE provider_message_id = $1", [providerMessageId]);
  return (rowCount ?? 0) > 0;
}

/** Applies a delivery event; returns false when no row has this message id or the status would move back. */
export async function applyPatientEmailStatus(
  client: PoolClient,
  providerMessageId: string,
  status: PatientEmailStatus,
  detail: string | null,
  at: Date
): Promise<boolean> {
  const ranks = Object.entries(EMAIL_STATUS_RANK).filter(([, rank]) => rank < EMAIL_STATUS_RANK[status]).map(([s]) => s);
  // Same-rank terminal statuses (bounced/failed/suppressed) don't overwrite each other either.
  const { rowCount } = await client.query(
    `UPDATE patient_email_send
        SET status = $2, status_detail = $3, status_at = $4
      WHERE provider_message_id = $1 AND status = ANY($5::text[])`,
    [providerMessageId, status, detail, at, ranks]
  );
  return (rowCount ?? 0) > 0;
}

export async function listPatientEmailSends(client: PoolClient, patientId: string, limit = 50): Promise<PatientEmailSend[]> {
  const { rows } = await client.query<PatientEmailSend>(
    `SELECT * FROM patient_email_send WHERE patient_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [patientId, limit]
  );
  return rows;
}
