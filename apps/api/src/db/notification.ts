import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/**
 * Notification Center — in-app inbox. See ADR-012.
 *
 * Keyed to identities (not users): identity_id is the universal TPT base,
 * shared with practitioner/patient/lead, so this table doesn't need a
 * re-migration when a future portal needs its own bell.
 */

export interface Notification {
  id: string;
  identity_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  read_at: Date | null;
  metadata: Record<string, unknown> | null;
  category: string;
  priority: string;
  group_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface InsertNotificationInput {
  identity_id: string;
  type: string;
  title: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
  category?: string;
  priority?: string;
}

const NOTIFICATION_COLS =
  "id, identity_id, type, title, body, entity_type, entity_id, action_url, read_at, metadata, category, priority, group_count, created_at, updated_at";

/** Resolves the identity_id (TPT base row) for a `users` row — every notification query is scoped by identity_id, not users.id. */
export async function getIdentityIdForUser(client: PoolClient, userId: string): Promise<string | null> {
  try {
    const { rows } = await client.query<{ identity_id: string }>(
      "SELECT identity_id FROM users WHERE id = $1",
      [userId]
    );
    return rows[0]?.identity_id ?? null;
  } catch (err) {
    throw new DatabaseError("getIdentityIdForUser", err);
  }
}

export interface GetNotificationsPaginatedResult {
  rows: Notification[];
  total: number;
}

export async function getNotificationsPaginated(
  client: PoolClient,
  identityId: string,
  filter: "all" | "unread",
  page: number,
  limit: number
): Promise<GetNotificationsPaginatedResult> {
  try {
    const conditions = ["identity_id = $1"];
    if (filter === "unread") conditions.push("read_at IS NULL");
    const where = conditions.join(" AND ");
    const offset = (page - 1) * limit;

    // Sequential, not Promise.all: `client` is a single PoolClient, and pg
    // only ever runs one query at a time per connection — concurrent calls
    // just queue behind each other internally, which pg 9.0 removes. See the
    // same note in queries/auditLog.ts.
    const { rows } = await client.query<Notification>(
      `SELECT ${NOTIFICATION_COLS} FROM notification WHERE ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [identityId, limit, offset]
    );
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM notification WHERE ${where}`,
      [identityId]
    );

    return { rows, total: Number(countRows[0]?.count ?? 0) };
  } catch (err) {
    throw new DatabaseError("getNotificationsPaginated", err);
  }
}

export async function getUnreadNotificationCount(client: PoolClient, identityId: string): Promise<number> {
  try {
    const { rows } = await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM notification WHERE identity_id = $1 AND read_at IS NULL",
      [identityId]
    );
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    throw new DatabaseError("getUnreadNotificationCount", err);
  }
}

/** Marks one notification read. Scoped by identity_id so a rep can't mark another identity's notification read by guessing an id. Returns null if not found (or not owned). */
export async function markNotificationRead(
  client: PoolClient,
  id: string,
  identityId: string
): Promise<Notification | null> {
  try {
    const { rows } = await client.query<Notification>(
      `UPDATE notification SET read_at = now()
       WHERE id = $1 AND identity_id = $2 AND read_at IS NULL
       RETURNING ${NOTIFICATION_COLS}`,
      [id, identityId]
    );
    if (rows[0]) return rows[0];

    // Already read, or genuinely missing/not-owned — distinguish so the route can 404 correctly.
    const { rows: existing } = await client.query<Notification>(
      `SELECT ${NOTIFICATION_COLS} FROM notification WHERE id = $1 AND identity_id = $2`,
      [id, identityId]
    );
    return existing[0] ?? null;
  } catch (err) {
    throw new DatabaseError("markNotificationRead", err);
  }
}

export async function markAllNotificationsRead(client: PoolClient, identityId: string): Promise<number> {
  try {
    const { rowCount } = await client.query(
      "UPDATE notification SET read_at = now() WHERE identity_id = $1 AND read_at IS NULL",
      [identityId]
    );
    return rowCount ?? 0;
  } catch (err) {
    throw new DatabaseError("markAllNotificationsRead", err);
  }
}

/** Creates an inbox row. Producers go through notify() (notifications/notify.ts), which also writes the deliveries — call this directly only from notify() and tests. */
export async function insertNotification(client: PoolClient, input: InsertNotificationInput): Promise<Notification> {
  try {
    const { rows } = await client.query<Notification>(
      `INSERT INTO notification (identity_id, type, title, body, entity_type, entity_id, action_url, metadata, category, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9, 'operational'), COALESCE($10, 'normal'))
       RETURNING ${NOTIFICATION_COLS}`,
      [
        input.identity_id,
        input.type,
        input.title,
        input.body ?? null,
        input.entity_type ?? null,
        input.entity_id ?? null,
        input.action_url ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.category ?? null,
        input.priority ?? null,
      ]
    );
    return rows[0];
  } catch (err) {
    throw new DatabaseError("insertNotification", err);
  }
}

/**
 * The unread row an identical event folds into: same recipient, type and
 * entity, touched within the last `windowMinutes`. Locked FOR UPDATE so two
 * concurrent events for the same record bump one row instead of racing.
 */
export async function findGroupableNotification(
  client: PoolClient,
  identityId: string,
  type: string,
  entityId: string | null,
  windowMinutes: number
): Promise<Notification | null> {
  try {
    const { rows } = await client.query<Notification>(
      `SELECT ${NOTIFICATION_COLS} FROM notification
        WHERE identity_id = $1 AND type = $2 AND entity_id IS NOT DISTINCT FROM $3
          AND read_at IS NULL AND updated_at >= now() - make_interval(mins => $4)
        ORDER BY updated_at DESC LIMIT 1
        FOR UPDATE`,
      [identityId, type, entityId, windowMinutes]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("findGroupableNotification", err);
  }
}

/** Folds one more identical event into an existing unread row. */
export async function bumpNotificationGroup(
  client: PoolClient,
  id: string,
  update: { title: string; body: string | null; metadata: Record<string, unknown> | null }
): Promise<Notification> {
  try {
    const { rows } = await client.query<Notification>(
      `UPDATE notification
          SET group_count = group_count + 1, updated_at = now(), title = $2, body = $3, metadata = $4::jsonb
        WHERE id = $1
        RETURNING ${NOTIFICATION_COLS}`,
      [id, update.title, update.body, update.metadata ? JSON.stringify(update.metadata) : null]
    );
    return rows[0]!;
  } catch (err) {
    throw new DatabaseError("bumpNotificationGroup", err);
  }
}

export interface NotificationDelivery {
  id: string;
  notification_id: string;
  channel: string;
  status: string;
  not_before: Date;
  attempts: number;
  sent_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
}

/**
 * One delivery row per (notification, channel). in_app is born delivered (the
 * inbox row is the delivery); every other channel starts pending for the
 * worker (NEO-136). ON CONFLICT DO NOTHING: a grouped event whose push already
 * went out does not queue a second one.
 */
export async function insertNotificationDelivery(
  client: PoolClient,
  notificationId: string,
  channel: string,
  notBefore?: Date
): Promise<void> {
  const delivered = channel === "in_app";
  try {
    await client.query(
      `INSERT INTO notification_delivery (notification_id, channel, status, delivered_at, not_before)
       VALUES ($1, $2, $3, $4, COALESCE($5, now()))
       ON CONFLICT (notification_id, channel) DO NOTHING`,
      [notificationId, channel, delivered ? "delivered" : "pending", delivered ? new Date() : null, notBefore ?? null]
    );
  } catch (err) {
    throw new DatabaseError("insertNotificationDelivery", err);
  }
}

export async function getNotificationDeliveries(client: PoolClient, notificationId: string): Promise<NotificationDelivery[]> {
  try {
    const { rows } = await client.query<NotificationDelivery>(
      `SELECT id, notification_id, channel, status, not_before, attempts, sent_at, delivered_at, created_at
         FROM notification_delivery WHERE notification_id = $1 ORDER BY channel`,
      [notificationId]
    );
    return rows;
  } catch (err) {
    throw new DatabaseError("getNotificationDeliveries", err);
  }
}

/**
 * Active admins' and managers' identity ids — the tenant-wide audience for
 * events like NEO-196/197 (an invite accepted, a device order placed), on
 * top of whichever doctor is also notified. Mirrors
 * db/deviceOrderReconciliation.ts's listActiveAdminEmails, but by identity_id
 * (for the in-app inbox) and role IN ('admin', 'manager').
 */
export async function getActiveAdminManagerIdentityIds(client: PoolClient): Promise<string[]> {
  try {
    const { rows } = await client.query<{ identity_id: string }>(
      `SELECT DISTINCT u.identity_id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role IN ('admin', 'manager')
        WHERE u.deleted_at IS NULL AND u.status = 'active'`
    );
    return rows.map((r) => r.identity_id);
  } catch (err) {
    throw new DatabaseError("getActiveAdminManagerIdentityIds", err);
  }
}

/** The recipient's UI language (identities.language), for rendering copy. */
export async function getIdentityLanguage(client: PoolClient, identityId: string): Promise<string | null> {
  try {
    const { rows } = await client.query<{ language: string }>("SELECT language FROM identities WHERE id = $1", [identityId]);
    return rows[0]?.language ?? null;
  } catch (err) {
    throw new DatabaseError("getIdentityLanguage", err);
  }
}
