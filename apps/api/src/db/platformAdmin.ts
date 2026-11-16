import { getDb } from "./connection.js";

/**
 * Platform admin = an active platform.users row (the NeoSleep team, not a
 * tenant's staff) with role owner or admin and the same email as the caller.
 */
export async function isPlatformAdmin(email: string | null | undefined): Promise<boolean> {
  return hasPlatformRole(email, ["owner", "admin"]);
}

/**
 * Platform staff = a platform admin or a NeoCRM support employee (role support, CORE-197).
 * Opens the cross-tenant screens they share: the Errors tab and the work board.
 */
export async function isPlatformStaff(email: string | null | undefined): Promise<boolean> {
  return hasPlatformRole(email, ["owner", "admin", "support"]);
}

/**
 * Keeps a tenant user's platform.users support row in step with their tenant role
 * (CORE-209), so role Support on the Users screen also opens the Errors tab and the
 * work board. Runs on the caller's client, inside the same transaction as the edit.
 * - active Support user, edited by a platform admin → row upserted (support, active).
 *   A tenant-only admin can't grant cross-tenant access, so nothing happens then.
 * - not Support any more, deactivated or deleted → the support row is switched off,
 *   whoever made the edit (losing access is safe; keeping it is not).
 * Owner/admin/readonly rows are never changed: those are set on the platform side.
 */
export async function syncSupportPlatformAccess(
  client: Queryable,
  actorEmail: string | null | undefined,
  user: { email: string; name: string | null; role: string; status: string; deleted?: boolean }
): Promise<void> {
  const wantsAccess = user.role === "support" && user.status === "active" && !user.deleted;
  if (!wantsAccess) {
    await client.query(
      `UPDATE platform.users SET is_active = false, updated_at = now()
        WHERE lower(email) = lower($1) AND role = 'support' AND is_active`,
      [user.email]
    );
    return;
  }
  if (!(await hasPlatformRole(actorEmail, ["owner", "admin"], client))) return;
  // platform.users.email is unique but case-sensitive, so match on lower() in both steps
  // instead of ON CONFLICT, which would add a second row next to a mixed-case one.
  await client.query(
    `UPDATE platform.users SET is_active = true, updated_at = now()
      WHERE lower(email) = lower($1) AND role = 'support' AND NOT is_active`,
    [user.email]
  );
  await client.query(
    `INSERT INTO platform.users (email, name, role)
     SELECT lower($1), COALESCE(NULLIF(trim($2), ''), lower($1)), 'support'
      WHERE NOT EXISTS (SELECT 1 FROM platform.users WHERE lower(email) = lower($1))`,
    [user.email, user.name]
  );
}

interface Queryable {
  query<R extends object>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

async function hasPlatformRole(email: string | null | undefined, roles: string[], client: Queryable = getDb()): Promise<boolean> {
  if (!email) return false;
  const { rows } = await client.query<{ ok: boolean }>(
    `SELECT true AS ok FROM platform.users
      WHERE lower(email) = lower($1) AND is_active AND role = ANY($2)
      LIMIT 1`,
    [email, roles]
  );
  return rows.length > 0;
}
