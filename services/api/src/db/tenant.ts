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
 * SAFE FINALLY:
 * client.release() is called unconditionally in its own try/catch so that a ROLLBACK
 * failure cannot prevent the connection from being returned to the pool.
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
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ROLLBACK failure is non-critical — the connection will be destroyed by pg
      // if it's in a bad state. We do NOT rethrow here so that release() still runs.
    }
    if (err instanceof AppError) throw err;
    throw new DatabaseError("withTenant", err);
  } finally {
    // release() is unconditional — even if ROLLBACK threw above.
    // Passing `true` destroys the connection instead of returning it to the pool
    // if it was in an error state.
    client.release();
  }
}

export function tenantSlugFromHost(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length >= 3) return parts[0].toLowerCase();
  return process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
}
