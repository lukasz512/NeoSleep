import type { PoolClient } from "pg";
import { ForbiddenError } from "../errors.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { UserRoleScope } from "../db.js";

/**
 * Territory-based data scoping (migration 022), separate from requireRole()'s
 * role check. Each granted role carries a scope territory_id — a country
 * node, or the reserved 'global' root meaning "every country in the tenant".
 * A record is visible iff its own territory falls inside (or equals) at
 * least one granted role's scope, checked via ltree containment (`<@`) — the
 * same check handles a country-scoped role and a global-scoped role with no
 * special-casing, since global is just the tree's root every country sits
 * under.
 *
 * Unlike requireRole (a pure route guard), scope enforcement is data-
 * dependent: for list endpoints the allowed scope filters the query; for
 * single-record endpoints the record's own territory isn't known until after
 * it's fetched. So these are plain functions Commands/Queries call
 * explicitly (ctx-based, like the rest of that layer — see TenantContext.ts's
 * "cook" doc comment), not Express middleware.
 */

/**
 * null = unrestricted (some role has the global root as its scope) — skip
 * any scope filtering entirely. [] = matches nothing — a ctx.user with no
 * roles at all (e.g. a session created before this field existed, still
 * alive server-side) fails secure, same as before migration 022. Otherwise
 * the ltree path (as text) of every distinct granted scope, for use with
 * `<@ ANY($n::ltree[])`.
 *
 * One query per call — call once per request and thread the result through,
 * not once per candidate record.
 */
export async function getAllowedScopePaths(
  client: PoolClient,
  roles: UserRoleScope[] | undefined
): Promise<string[] | null> {
  if (!roles || roles.length === 0) return [];
  const territoryIds = [...new Set(roles.map((r) => r.territory_id))];
  const { rows } = await client.query<{ path: string; kind: string }>(
    `SELECT path::text AS path, kind FROM territory WHERE id = ANY($1::uuid[])`,
    [territoryIds]
  );
  if (rows.some((r) => r.kind === "global")) return null;
  return rows.map((r) => r.path);
}

/**
 * Throws ForbiddenError if `recordCountryCode` falls outside ctx.user's
 * allowed scopes. Call after fetching a single record, before returning/
 * mutating it. A record with no country_code known, under a restricted
 * (non-global) scope, is denied — same fail-secure default as before.
 */
export async function assertTerritoryAccess(
  ctx: TenantContext,
  recordCountryCode: string | null | undefined
): Promise<void> {
  const allowedPaths = await getAllowedScopePaths(ctx.client, ctx.user.roles);
  if (allowedPaths === null) return; // global

  if (allowedPaths.length === 0 || !recordCountryCode) {
    throw new ForbiddenError("This record is outside your assigned region");
  }

  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `SELECT (t.path <@ ANY($2::ltree[])) AS ok FROM territory t WHERE t.kind = 'country' AND t.country_code = $1`,
    [recordCountryCode, allowedPaths]
  );
  if (!rows[0]?.ok) {
    throw new ForbiddenError("This record is outside your assigned region");
  }
}

/**
 * Same check as assertTerritoryAccess, for entities that carry their own
 * territory_id directly (Patient/HCP/HCO — unlike a staff User, which only
 * has a flat country_code) — no country_code resolution step needed. A
 * record with no territory_id assigned yet is allowed through regardless of
 * scope (see this repo's territory-rollout notes: zero records have
 * territory_id populated as of migration 022, so a strict check here would
 * hide everything from every non-global-scoped user — same rollout-safety
 * fallback the list-query filters use).
 */
export async function assertTerritoryAccessByTerritoryId(
  ctx: TenantContext,
  recordTerritoryId: string | null | undefined
): Promise<void> {
  const allowedPaths = await getAllowedScopePaths(ctx.client, ctx.user.roles);
  if (allowedPaths === null) return; // global
  if (!recordTerritoryId) return; // unassigned — rollout-safety fallback

  if (allowedPaths.length === 0) {
    throw new ForbiddenError("This record is outside your assigned region");
  }

  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `SELECT (path <@ ANY($2::ltree[])) AS ok FROM territory WHERE id = $1`,
    [recordTerritoryId, allowedPaths]
  );
  if (!rows[0]?.ok) {
    throw new ForbiddenError("This record is outside your assigned region");
  }
}
