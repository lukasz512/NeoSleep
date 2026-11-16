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

async function hasPlatformRole(email: string | null | undefined, roles: string[]): Promise<boolean> {
  if (!email) return false;
  const { rows } = await getDb().query<{ ok: boolean }>(
    `SELECT true AS ok FROM platform.users
      WHERE lower(email) = lower($1) AND is_active AND role = ANY($2)
      LIMIT 1`,
    [email, roles]
  );
  return rows.length > 0;
}
