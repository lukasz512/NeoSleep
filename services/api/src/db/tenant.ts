import type { PoolClient } from "pg";
import { getDb } from "./connection.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

function sanitizeSlug(slug: string): string {
  if (!/^[a-z0-9_][a-z0-9_-]*$/.test(slug)) {
    throw new ValidationError(`Invalid tenant slug: "${slug}"`);
  }
  return slug;
}

export async function withTenant<T>(
  tenantSlug: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const slug = sanitizeSlug(tenantSlug);
  const client = await getDb().connect();
  try {
    await client.query(`SET search_path TO "${slug}", public`);
    return await fn(client);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("withTenant", err);
  } finally {
    await client.query("RESET search_path");
    client.release();
  }
}

export function tenantSlugFromHost(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length >= 3) return parts[0].toLowerCase();
  return process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
}
