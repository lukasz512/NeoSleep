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
  created_at: Date;
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
}

const NOTIFICATION_COLS =
  "id, identity_id, type, title, body, entity_type, entity_id, action_url, read_at, metadata, created_at";

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

    const [{ rows }, { rows: countRows }] = await Promise.all([
      client.query<Notification>(
        `SELECT ${NOTIFICATION_COLS} FROM notification WHERE ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [identityId, limit, offset]
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*) FROM notification WHERE ${where}`,
        [identityId]
      ),
    ]);

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

/** Creates a notification event. Internal — no route calls this directly yet; domain commands will call it once event producers are wired (see ADR-012 §5). */
export async function insertNotification(client: PoolClient, input: InsertNotificationInput): Promise<Notification> {
  try {
    const { rows } = await client.query<Notification>(
      `INSERT INTO notification (identity_id, type, title, body, entity_type, entity_id, action_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
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
      ]
    );
    return rows[0];
  } catch (err) {
    throw new DatabaseError("insertNotification", err);
  }
}
