import type { PoolClient } from "pg";

/**
 * {tenant}.webhook_event — every verified inbound webhook, stored raw before it is
 * applied (CORE-213). (source, external_id) is unique, so a provider's retry of the
 * same delivery finds the row instead of applying twice, and a failed row can be
 * replayed from its payload.
 */

export type WebhookEventStatus = "pending" | "processing" | "processed" | "failed" | "skipped";

export interface WebhookEventRow {
  id: string;
  source: string;
  event_type: string;
  external_id: string | null;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  attempts: number;
  last_error: string | null;
  processed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const COLUMNS = "id, source, event_type, external_id, payload, status, attempts, last_error, processed_at, metadata, created_at";

/**
 * Stores the event (or finds the one already stored for this delivery) and locks the
 * row for the caller's transaction, so two concurrent retries apply it once.
 * `fresh` is false when the row already existed.
 */
export async function claimWebhookEvent(
  client: PoolClient,
  input: { source: string; eventType: string; externalId: string; payload: unknown }
): Promise<{ row: WebhookEventRow; fresh: boolean }> {
  const inserted = await client.query<WebhookEventRow>(
    `INSERT INTO webhook_event (source, event_type, external_id, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source, external_id) DO NOTHING
     RETURNING ${COLUMNS}`,
    [input.source, input.eventType, input.externalId, JSON.stringify(input.payload)]
  );
  if (inserted.rows[0]) return { row: inserted.rows[0], fresh: true };
  const { rows } = await client.query<WebhookEventRow>(
    `SELECT ${COLUMNS} FROM webhook_event WHERE source = $1 AND external_id = $2 FOR UPDATE`,
    [input.source, input.externalId]
  );
  return { row: rows[0]!, fresh: false };
}

export async function finishWebhookEvent(
  client: PoolClient,
  id: string,
  status: Extract<WebhookEventStatus, "processed" | "skipped" | "failed">,
  outcome: string,
  error: string | null = null
): Promise<void> {
  await client.query(
    `UPDATE webhook_event
        SET status = $2, attempts = attempts + 1, last_error = $3,
            processed_at = CASE WHEN $2 = 'failed' THEN processed_at ELSE now() END,
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('outcome', $4::text)
      WHERE id = $1`,
    [id, status, error?.slice(0, 1000) ?? null, outcome]
  );
}

export async function getWebhookEvent(client: PoolClient, source: string, externalId: string): Promise<WebhookEventRow | null> {
  const { rows } = await client.query<WebhookEventRow>(`SELECT ${COLUMNS} FROM webhook_event WHERE source = $1 AND external_id = $2`, [source, externalId]);
  return rows[0] ?? null;
}
