import { ForbiddenError } from "../errors.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { UserRoleScope } from "../db.js";

/**
 * Country-level data scoping, separate from requireRole()'s role check.
 * ctx.user.roles grants access to a list of country_codes, unless any role
 * has scope 'global' — in which case access is unrestricted.
 *
 * Unlike requireRole (a pure route guard), scope enforcement is data-
 * dependent: for list endpoints the allowed countries filter the query; for
 * single-record endpoints the record's own country_code isn't known until
 * after it's fetched. So these are plain functions Commands/Queries call
 * explicitly (ctx-based, like the rest of that layer — see TenantContext.ts's
 * "cook" doc comment), not Express middleware.
 */

/**
 * null = unrestricted (some role has scope 'global'). Otherwise the union of
 * country_codes across all roles. A ctx.user with no roles at all (e.g. a
 * session created before this field existed, still alive server-side) fails
 * secure — returns [] (matches nothing) rather than null (unrestricted).
 * Every real staff user always has >=1 user_roles row, so this only affects
 * stale pre-migration sessions, which should re-authenticate anyway.
 */
export function getAllowedCountryCodes(roles: UserRoleScope[] | undefined): string[] | null {
  if (!roles || roles.length === 0) return [];
  if (roles.some((r) => r.scope === "global")) return null;
  return [...new Set(roles.map((r) => r.scope))];
}

/** Throws ForbiddenError if `recordCountryCode` falls outside ctx.user's allowed scopes. Call after fetching a single record, before returning/mutating it. */
export function assertScopeAccess(ctx: TenantContext, recordCountryCode: string | null | undefined): void {
  const allowed = getAllowedCountryCodes(ctx.user.roles);
  if (allowed === null) return; // global
  if (!recordCountryCode || !allowed.includes(recordCountryCode)) {
    throw new ForbiddenError("This record is outside your assigned region");
  }
}
