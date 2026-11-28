import type { UserRole } from "../stores/auth";
import { isRoleAllowed, routes } from "../router/routes";

/**
 * Whether the role may use NeoSleep AI (CORE-292). Derived from the /ai route's roles so the
 * palette entry and the route can never disagree; the API still enforces it (403).
 */
export function canUseAi(role: UserRole | undefined | null): boolean {
  const aiRoute = routes.find((r) => (r as { name?: string }).name === "ai");
  if (!aiRoute || !role) return false;
  const roles = (aiRoute.meta as { roles?: UserRole[] } | undefined)?.roles;
  return isRoleAllowed(roles, role);
}
