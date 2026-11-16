import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import { NOTIFICATION_TYPES, getEventDefinition } from "./catalog.js";

/**
 * Escalation (CORE-3, ADR-027 §4): a notification still unread in-app after its
 * catalog `escalateAfterMin` gets one email delivery row, which the email
 * adapter (CORE-6) then sends. "Once" is guaranteed by the unique
 * (notification_id, channel) index plus ON CONFLICT DO NOTHING: an email row
 * that already exists (catalog channel, an earlier escalation, a concurrent
 * tick) is never duplicated. Read notifications are never escalated.
 */
export async function escalateUnreadNotifications(client: PoolClient, now: Date = new Date()): Promise<number> {
  const types: string[] = [];
  const minutes: number[] = [];
  for (const type of NOTIFICATION_TYPES) {
    const after = getEventDefinition(type).escalateAfterMin;
    if (after !== null) {
      types.push(type);
      minutes.push(after);
    }
  }
  if (types.length === 0) return 0;
  try {
    const { rowCount } = await client.query(
      `INSERT INTO notification_delivery (notification_id, channel, status, not_before)
       SELECT n.id, 'email', 'pending', $1::timestamptz
         FROM notification n
         JOIN unnest($2::text[], $3::int[]) AS e(type, after_min) ON e.type = n.type
        WHERE n.read_at IS NULL
          AND n.created_at <= $1::timestamptz - make_interval(mins => e.after_min)
       ON CONFLICT (notification_id, channel) DO NOTHING`,
      [now, types, minutes]
    );
    return rowCount ?? 0;
  } catch (err) {
    throw new DatabaseError("escalateUnreadNotifications", err);
  }
}
