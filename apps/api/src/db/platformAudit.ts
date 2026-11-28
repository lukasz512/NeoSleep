import type { PoolClient } from "pg";
import { getDb } from "./connection.js";

/**
 * platform.audit (000_platform.sql) — who did what on the cross-tenant admin screens
 * (CORE-213). Tenant business data keeps its own trail in {tenant}.audit_log, and a
 * work item's history stays in platform.work_item_event; this table is for the
 * platform-admin actions that have no other home: error-ticket status, board session
 * tokens, and later tenant/user/feature admin.
 *
 * Every write here runs in the caller's transaction (inPlatformTransaction), so the
 * change and its audit row commit or roll back together.
 */

export interface PlatformAuditActor {
  email: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface PlatformAuditEntry {
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface PlatformAuditRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export async function inPlatformTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** actor_id is the caller's platform.users row when there is one; the email is kept either way. */
export async function insertPlatformAudit(client: PoolClient, actor: PlatformAuditActor, entry: PlatformAuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO platform.audit (actor_id, actor_email, action, target_type, target_id, before, after, ip_address, user_agent)
     VALUES ((SELECT id FROM platform.users WHERE lower(email) = lower($1) LIMIT 1), $1, $2, $3, $4, $5, $6, $7::inet, $8)`,
    [
      actor.email,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.before ?? null,
      entry.after ?? null,
      actor.ip,
      actor.userAgent?.slice(0, 512) ?? null,
    ]
  );
}

/** Newest first, for one target — what the admin trail shows and what tests read. */
export async function listPlatformAudit(targetType: string, targetId: string): Promise<PlatformAuditRow[]> {
  const { rows } = await getDb().query<PlatformAuditRow>(
    `SELECT id, created_at, actor_id, actor_email, action, target_type, target_id, before, after
       FROM platform.audit WHERE target_type = $1 AND target_id = $2
      ORDER BY created_at DESC, id`,
    [targetType, targetId]
  );
  return rows;
}
