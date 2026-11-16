import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import type { NotificationChannel } from "./catalog.js";

/**
 * Delivery dispatcher (CORE-3, ADR-027 §3): picks up the notification_delivery
 * rows notify() queued as `pending` and hands each to its channel's adapter.
 *
 * Overlap safety: the batch is claimed with FOR UPDATE SKIP LOCKED inside the
 * caller's transaction (withTenant), so two ticks that run at the same time
 * never see the same row — the second skips whatever the first holds. The row
 * is updated (sent / retry / failed) before the transaction commits, so a row
 * is never left half-handled.
 *
 * Adapters are plugged in by the channel tickets (push: CORE-5, email: CORE-6).
 * Until then every channel has a "not configured" adapter; its rows are not
 * even claimed, so they stay pending (never failed) and are sent as soon as an
 * adapter is registered.
 */

export const MAX_DELIVERY_ATTEMPTS = 5;
export const DISPATCH_BATCH_SIZE = 50;
const BACKOFF_BASE_MIN = 5;
const BACKOFF_CAP_MIN = 120;

/** What the adapter sees. PHI-free by construction: copy comes from the catalog (see notify.ts). */
export interface DueDelivery {
  id: string;
  notificationId: string;
  channel: string;
  /** Attempts already made before this one. */
  attempts: number;
  identityId: string;
  type: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  priority: string;
}

export type AdapterResult =
  | { kind: "sent"; providerMessageId?: string | null }
  /** Transient problem: try again later with backoff, up to MAX_DELIVERY_ATTEMPTS. */
  | { kind: "retry"; reason: string }
  /** Permanent problem (e.g. no address, subscription gone): fail at once. */
  | { kind: "failed"; reason: string };

export interface ChannelAdapter {
  channel: NotificationChannel;
  /** false: the dispatcher does not claim this channel's rows at all. */
  isConfigured(): boolean;
  send(delivery: DueDelivery): Promise<AdapterResult>;
}

export type AdapterRegistry = ReadonlyMap<string, ChannelAdapter>;

function notConfigured(channel: NotificationChannel): ChannelAdapter {
  return {
    channel,
    isConfigured: () => false,
    send: async () => ({ kind: "retry", reason: `${channel} adapter not configured` }),
  };
}

/**
 * The live registry. CORE-5 replaces the push entry, CORE-6 the email one;
 * in_app is never dispatched (its delivery row is born delivered).
 */
export function createDefaultRegistry(): Map<string, ChannelAdapter> {
  const registry = new Map<string, ChannelAdapter>();
  for (const channel of ["push", "email", "sms", "whatsapp"] as const) registry.set(channel, notConfigured(channel));
  return registry;
}

export const adapterRegistry = createDefaultRegistry();

/** Plug a real adapter in (CORE-5 / CORE-6). */
export function registerChannelAdapter(adapter: ChannelAdapter): void {
  adapterRegistry.set(adapter.channel, adapter);
}

/** Minutes to wait after the Nth failed attempt: 5, 10, 20, 40, ... capped at 2 h. */
export function backoffMinutes(attemptsMade: number): number {
  return Math.min(BACKOFF_BASE_MIN * 2 ** Math.max(0, attemptsMade - 1), BACKOFF_CAP_MIN);
}

export interface DispatchResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

interface ClaimedRow {
  id: string;
  notification_id: string;
  channel: string;
  attempts: number;
  identity_id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  priority: string;
}

export async function dispatchDueDeliveries(
  client: PoolClient,
  opts: { now?: Date; registry?: AdapterRegistry; batchSize?: number } = {}
): Promise<DispatchResult> {
  const now = opts.now ?? new Date();
  const registry = opts.registry ?? adapterRegistry;
  const result: DispatchResult = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  const channels = [...registry.values()].filter((a) => a.isConfigured()).map((a) => a.channel);
  if (channels.length === 0) return result;

  let rows: ClaimedRow[];
  try {
    ({ rows } = await client.query<ClaimedRow>(
      `SELECT d.id, d.notification_id, d.channel, d.attempts,
              n.identity_id, n.type, n.title, n.body, n.action_url, n.priority
         FROM notification_delivery d
         JOIN notification n ON n.id = d.notification_id
        WHERE d.status = 'pending' AND d.not_before <= $1 AND d.channel = ANY($2::text[])
        ORDER BY d.not_before, d.id
        LIMIT $3
        FOR UPDATE OF d SKIP LOCKED`,
      [now, channels, opts.batchSize ?? DISPATCH_BATCH_SIZE]
    ));
  } catch (err) {
    throw new DatabaseError("dispatchDueDeliveries.claim", err);
  }
  result.claimed = rows.length;

  for (const row of rows) {
    const adapter = registry.get(row.channel);
    if (!adapter) continue;
    let outcome: AdapterResult;
    try {
      outcome = await adapter.send({
        id: row.id,
        notificationId: row.notification_id,
        channel: row.channel,
        attempts: row.attempts,
        identityId: row.identity_id,
        type: row.type,
        title: row.title,
        body: row.body,
        actionUrl: row.action_url,
        priority: row.priority,
      });
    } catch (err) {
      outcome = { kind: "retry", reason: err instanceof Error ? err.message : String(err) };
    }
    await settle(client, row, outcome, now, result);
  }
  return result;
}

async function settle(client: PoolClient, row: ClaimedRow, outcome: AdapterResult, now: Date, result: DispatchResult): Promise<void> {
  const attemptsMade = row.attempts + 1;
  try {
    if (outcome.kind === "sent") {
      await client.query(
        `UPDATE notification_delivery
            SET status = 'sent', attempts = $2, sent_at = $3, provider_message_id = $4, failed_reason = NULL
          WHERE id = $1`,
        [row.id, attemptsMade, now, outcome.providerMessageId ?? null]
      );
      result.sent += 1;
    } else if (outcome.kind === "failed" || attemptsMade >= MAX_DELIVERY_ATTEMPTS) {
      await client.query(
        `UPDATE notification_delivery SET status = 'failed', attempts = $2, failed_reason = $3 WHERE id = $1`,
        [row.id, attemptsMade, outcome.reason.slice(0, 500)]
      );
      result.failed += 1;
    } else {
      const notBefore = new Date(now.getTime() + backoffMinutes(attemptsMade) * 60_000);
      await client.query(
        `UPDATE notification_delivery SET attempts = $2, not_before = $3, failed_reason = $4 WHERE id = $1`,
        [row.id, attemptsMade, notBefore, outcome.reason.slice(0, 500)]
      );
      result.retried += 1;
    }
  } catch (err) {
    throw new DatabaseError("dispatchDueDeliveries.settle", err);
  }
}
