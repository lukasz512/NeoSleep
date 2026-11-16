import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/** Retention windows (CORE-3, ADR-027 §6). */
export const READ_RETENTION_DAYS = 90;
export const UNREAD_RETENTION_DAYS = 180;
export const DELIVERY_LOG_RETENTION_DAYS = 365;

export interface PurgeResult {
  notifications: number;
  deliveries: number;
}

/**
 * Read notifications go 90 days after they were read, unread ones 180 days
 * after they were created; their deliveries cascade. Settled delivery rows
 * (anything but pending) go a year after they were queued. Pending rows are
 * never purged on their own: they are still work for the dispatcher.
 */
export async function purgeNotifications(client: PoolClient, now: Date = new Date()): Promise<PurgeResult> {
  try {
    const dayMs = 86_400_000;
    const ago = (days: number): Date => new Date(now.getTime() - days * dayMs);
    const n = await client.query(
      `DELETE FROM notification
        WHERE (read_at IS NOT NULL AND read_at < $1)
           OR (read_at IS NULL AND created_at < $2)`,
      [ago(READ_RETENTION_DAYS), ago(UNREAD_RETENTION_DAYS)]
    );
    const d = await client.query(
      `DELETE FROM notification_delivery WHERE status <> 'pending' AND created_at < $1`,
      [ago(DELIVERY_LOG_RETENTION_DAYS)]
    );
    return { notifications: n.rowCount ?? 0, deliveries: d.rowCount ?? 0 };
  } catch (err) {
    throw new DatabaseError("purgeNotifications", err);
  }
}
