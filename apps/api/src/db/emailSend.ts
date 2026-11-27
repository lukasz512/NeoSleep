import type { PoolClient } from "pg";

/**
 * NEO-273: what happened to each email the app sent, for every recipient type.
 * The row is written when Resend accepts the email; Resend's webhook then moves
 * `status` forward (commands/emailDelivery.ts). No health data, no full
 * address, no link.
 */
export type EmailRecipientType = "patient" | "practitioner" | "user";
export type EmailSendKind =
  | "questionnaire_link"
  | "signed_copy"
  | "appointment"
  | "document_link"
  | "partner_invite"
  | "partner_thank_you"
  | "account_created"
  | "password_reset";
export type EmailSendStatus = "sent" | "delayed" | "delivered" | "bounced" | "failed" | "suppressed" | "complained";

export interface EmailSend {
  id: string;
  recipient_type: EmailRecipientType;
  recipient_id: string;
  sent_by: string | null;
  kind: EmailSendKind;
  questionnaire_request_id: string | null;
  appointment_id: string | null;
  sent_to_masked: string;
  provider_message_id: string | null;
  status: EmailSendStatus;
  status_detail: string | null;
  status_at: Date | null;
  created_at: Date;
}

/**
 * Webhooks can arrive late or out of order (a "delayed" after "delivered").
 * A status only replaces one of a lower rank, so the row never moves back.
 * A spam complaint outranks everything: it can follow a delivery.
 */
export const EMAIL_STATUS_RANK: Record<EmailSendStatus, number> = {
  sent: 0,
  delayed: 1,
  delivered: 2,
  bounced: 3,
  failed: 3,
  suppressed: 3,
  complained: 4,
};

export async function insertEmailSend(
  client: PoolClient,
  input: {
    recipientType: EmailRecipientType;
    recipientId: string;
    sentBy: string | null;
    kind: EmailSendKind;
    questionnaireRequestId?: string | null;
    appointmentId?: string | null;
    sentToMasked: string;
    providerMessageId: string | null;
  }
): Promise<EmailSend> {
  const { rows } = await client.query<EmailSend>(
    `INSERT INTO email_send (recipient_type, recipient_id, sent_by, kind, questionnaire_request_id, appointment_id, sent_to_masked, provider_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.recipientType,
      input.recipientId,
      input.sentBy,
      input.kind,
      input.questionnaireRequestId ?? null,
      input.appointmentId ?? null,
      input.sentToMasked,
      input.providerMessageId,
    ]
  );
  return rows[0]!;
}

export async function emailSendExists(client: PoolClient, providerMessageId: string): Promise<boolean> {
  const { rowCount } = await client.query("SELECT 1 FROM email_send WHERE provider_message_id = $1", [providerMessageId]);
  return (rowCount ?? 0) > 0;
}

/** Applies a delivery event; returns false when no row has this message id or the status would move back. */
export async function applyEmailStatus(
  client: PoolClient,
  providerMessageId: string,
  status: EmailSendStatus,
  detail: string | null,
  at: Date
): Promise<boolean> {
  const lower = Object.entries(EMAIL_STATUS_RANK)
    .filter(([, rank]) => rank < EMAIL_STATUS_RANK[status])
    .map(([s]) => s);
  // Same-rank terminal statuses (bounced/failed/suppressed) don't overwrite each other either.
  const { rowCount } = await client.query(
    `UPDATE email_send
        SET status = $2, status_detail = $3, status_at = $4
      WHERE provider_message_id = $1 AND status = ANY($5::text[])`,
    [providerMessageId, status, detail, at, lower]
  );
  return (rowCount ?? 0) > 0;
}

export async function listEmailSends(
  client: PoolClient,
  recipientType: EmailRecipientType,
  recipientId: string,
  opts: { kinds?: EmailSendKind[]; limit?: number } = {}
): Promise<EmailSend[]> {
  const { rows } = await client.query<EmailSend>(
    `SELECT * FROM email_send
      WHERE recipient_type = $1 AND recipient_id = $2 AND ($3::text[] IS NULL OR kind = ANY($3::text[]))
      ORDER BY created_at DESC LIMIT $4`,
    [recipientType, recipientId, opts.kinds ?? null, opts.limit ?? 50]
  );
  return rows;
}

/**
 * Invite throttle input: when the latest send of this kind went to this
 * recipient, and how many went out in the last 24 h.
 */
export async function recentSendStats(
  client: PoolClient,
  recipientType: EmailRecipientType,
  recipientId: string,
  kind: EmailSendKind
): Promise<{ lastAt: Date | null; countLastDay: number }> {
  const { rows } = await client.query<{ last_at: Date | null; n: string }>(
    `SELECT max(created_at) AS last_at, count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS n
       FROM email_send WHERE recipient_type = $1 AND recipient_id = $2 AND kind = $3`,
    [recipientType, recipientId, kind]
  );
  return { lastAt: rows[0]?.last_at ?? null, countLastDay: Number(rows[0]?.n ?? 0) };
}
