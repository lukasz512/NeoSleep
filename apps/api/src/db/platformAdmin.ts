import { getDb } from "./connection.js";

/**
 * Platform admin = an active platform.users row (the NeoSleep team, not a
 * tenant's staff) with role owner or admin and the same email as the caller.
 */
export async function isPlatformAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { rows } = await getDb().query<{ ok: boolean }>(
    `SELECT true AS ok FROM platform.users
      WHERE lower(email) = lower($1) AND is_active AND role IN ('owner', 'admin')
      LIMIT 1`,
    [email]
  );
  return rows.length > 0;
}
