import type { PoolClient } from "pg";
import { getDb } from "./connection.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

/**
 * Validates that a tenant slug can safely be used in a SET search_path statement.
 * Slugs must be lowercase alphanumeric + underscores (e.g. "neosleep_pl").
 * This prevents search_path injection via a crafted Host header.
 */
function sanitizeSlug(slug: string): string {
  if (!/^[a-z0-9_][a-z0-9_]*$/.test(slug)) {
    throw new ValidationError(`Invalid tenant slug: "${slug}"`);
  }
  return slug;
}

/**
 * Executes fn inside a transaction with search_path scoped to the tenant schema.
 *
 * HOW TENANT ISOLATION WORKS HERE:
 * Instead of SET search_path (session-level), we use SET LOCAL inside a transaction.
 * SET LOCAL reverts automatically when the transaction ends (COMMIT or ROLLBACK).
 * This means a connection returned to the pool is always clean — no leaked tenant context.
 *
 * RELEASE, NOT DESTROY, UNLESS ROLLBACK ITSELF FAILS:
 * Only a failed ROLLBACK destroys the connection (release(true)) — that's
 * the one case where the session's state is actually unknown. A *successful*
 * ROLLBACK already fully resets the transaction (including the SET LOCAL above),
 * so the connection is clean and safe to return to the pool — destroying it here
 * too was needlessly forcing a fresh connection to Supabase's pooler on every
 * ordinary business-logic error (e.g. a routine 401), which measurably stalls the
 * very next withTenant() call.
 *
 * SLUG INJECTION PROTECTION:
 * sanitizeSlug() enforces a strict allowlist of characters before the slug
 * is interpolated into the SET LOCAL statement.
 */
export async function withTenant<T>(
  tenantSlug: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const slug = sanitizeSlug(tenantSlug);
  const client = await getDb().connect();

  try {
    await client.query("BEGIN");
    // SET LOCAL reverts when the transaction ends — no session-level contamination.
    await client.query(`SET LOCAL search_path TO "${slug}", public`);
    const result = await fn(client);
    await client.query("COMMIT");
    client.release();
    return result;
  } catch (err) {
    let rollbackFailed = false;
    try {
      await client.query("ROLLBACK");
    } catch {
      rollbackFailed = true;
    }
    client.release(rollbackFailed);
    if (err instanceof AppError) throw err;
    throw new DatabaseError("withTenant", err);
  }
}

/**
 * Tenant is chosen at login via a picker, not by subdomain (ADR-002) — there is
 * no hostname convention this can reliably parse. Any 3-label host (Render's
 * own <service>.onrender.com, or a future api.neosleepcare.com) would otherwise
 * be misread as "<service>" or "api" being the tenant slug. Single-tenant for
 * now, so always resolve to DEFAULT_TENANT_SLUG.
 */
export function tenantSlugFromHost(_hostname: string): string {
  return process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
}

/**
 * All tenant slugs currently marked 'active' in the platform schema —
 * queried directly against the pool (no tenant search_path to set, this IS
 * the platform-level lookup). Used by machine-to-machine job routes that
 * must run their work for every tenant rather than assuming a single one
 * (see routes/partners/orthoapnea-treatments.ts's sync-statuses job — that
 * route used to rely on tenantSlugFromHost(), which is a single-tenant stub
 * and silently only ever synced one tenant).
 */
export async function getActiveTenantSlugs(): Promise<string[]> {
  try {
    const { rows } = await getDb().query<{ slug: string }>(
      `SELECT slug FROM platform.tenants WHERE status = 'active' ORDER BY slug`
    );
    return rows.map((r) => r.slug);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getActiveTenantSlugs", err);
  }
}
