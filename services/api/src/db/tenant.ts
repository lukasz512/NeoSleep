import type { PoolClient } from "pg";
import { getDb } from "./connection.js";

/** Validate tenant slug: lowercase alphanumeric, underscore, hyphen. */
function sanitizeSlug(slug: string): string {
  if (!/^[a-z0-9_][a-z0-9_-]*$/.test(slug)) {
    throw new Error(`Invalid tenant slug: "${slug}"`);
  }
  return slug;
}

/**
 * Execute DB operations scoped to a tenant's PostgreSQL schema.
 * Checks out a dedicated client, sets search_path to the tenant schema,
 * runs fn, then resets before releasing back to the pool.
 *
 * Usage:
 *   const user = await withTenant("pharmaxyz", (client) => getUserById(id, client));
 */
export async function withTenant<T>(
  tenantSlug: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T | null> {
  const db = getDb();
  if (!db) return null;
  const slug = sanitizeSlug(tenantSlug);
  const client = await db.connect();
  try {
    await client.query(`SET search_path TO "${slug}", public`);
    return await fn(client);
  } finally {
    await client.query("RESET search_path");
    client.release();
  }
}

/**
 * Resolve tenant slug from an Express request hostname.
 * pharmaxyz.app.neosleepcare.com → "pharmaxyz"
 * localhost or app.neosleepcare.com → DEFAULT_TENANT_SLUG env var (dev fallback)
 */
export function tenantSlugFromHost(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length >= 3) return parts[0].toLowerCase();
  return process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
}
