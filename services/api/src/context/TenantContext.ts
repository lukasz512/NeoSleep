import type { PoolClient } from "pg";
import type { Request } from "express";
import { tenantSlugFromHost } from "../db.js";

/**
 * TenantContext — the object passed to every Command and Query.
 *
 * WHY THIS EXISTS (the "cook" concept):
 *   Routes (waiters) take the order and serve the plate.
 *   Commands/Queries (cooks) do the actual work.
 *   But a cook needs to know WHO ordered (user), FOR WHICH KITCHEN (tenant),
 *   and WHICH WORKTOP IS THEIRS (client = DB connection with search_path set).
 *
 *   TenantContext bundles all three so a command never needs to touch `req`.
 *   This makes commands independently testable — inject a fake context in tests.
 *
 * LIFECYCLE:
 *   1. Route handler calls withTenant(slug, async (client) => { ... })
 *   2. Inside the withTenant callback, build a TenantContext from (client + req)
 *   3. Pass the context to Command or Query
 *   4. withTenant commits the transaction and releases the client
 *
 * PERMISSIONS (future ABAC):
 *   user.permissions is a simple role-to-action map for now.
 *   It will be populated from platform.role_permissions in Stage 3.
 *   Currently derived from the session role string.
 */

export interface TenantUser {
  id: string;
  email: string;
  name?: string;
  role: "admin" | "manager" | "rep";
}

export interface TenantContext {
  slug: string;          // tenant schema name: "neosleep_pl"
  client: PoolClient;    // already has SET LOCAL search_path in effect
  user: TenantUser;      // who is executing the command
  requestId: string;     // correlation ID for distributed tracing / audit
}

/**
 * Builds a TenantContext from an Express request and a PoolClient.
 * Call this INSIDE a withTenant() callback after acquiring the client.
 *
 * Usage:
 *   const slug = tenantSlugFromHost(req.hostname);
 *   return withTenant(slug, async (client) => {
 *     const ctx = buildContext(req, client, slug);
 *     return CreateEncounterCommand(ctx, input);
 *   });
 */
export function buildContext(req: Request, client: PoolClient, slug?: string): TenantContext {
  const session = req.session as { user?: TenantUser };
  if (!session.user) throw new Error("buildContext called without authenticated session");

  return {
    slug:      slug ?? tenantSlugFromHost(req.hostname),
    client,
    user:      session.user,
    requestId: (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  };
}
