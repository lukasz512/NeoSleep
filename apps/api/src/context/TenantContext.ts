import type { PoolClient } from "pg";
import type { Request } from "express";
import { tenantSlugFromHost } from "../db.js";
import { getUserTokenVersion, type StaffRole } from "../db/users.js";
import { AuthError } from "../errors.js";

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
  role: StaffRole;
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
 *     const ctx = await buildContext(req, client, slug);
 *     return CreateEncounterCommand(ctx, input);
 *   });
 *
 * ASYNC + token_version CHECK: requireAuth/requireRole only verify the bearer token's
 * signature+expiry (fast, no DB call, works offline-first). This is where the token gets
 * checked against the LIVE users.token_version — a mismatch means the token was issued
 * before a password change (see auth.ts's incrementUserTokenVersion calls) and must be
 * rejected even though its signature/expiry are still valid. Deliberately NOT done in
 * requireAuth/requireRole — this is the one place a tenant-scoped DB client is already
 * open for every real command/query, so the extra check is nearly free here and free
 * everywhere else (route guards, offline reads).
 */
export async function buildContext(req: Request, client: PoolClient, slug?: string): Promise<TenantContext> {
  if (!req.user) throw new Error("buildContext called without an authenticated request");

  const liveTokenVersion = await getUserTokenVersion(client, req.user.sub);
  if (liveTokenVersion === null || liveTokenVersion !== req.user.tokenVersion) {
    throw new AuthError("Session has been invalidated. Please log in again.");
  }

  return {
    slug:      slug ?? tenantSlugFromHost(req.hostname),
    client,
    user: {
      id:    req.user.sub,
      email: req.user.email,
      name:  req.user.name,
      role:  req.user.role,
    },
    requestId: (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  };
}
