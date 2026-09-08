import type { RouteLocationRaw } from "vue-router";
import type { UserRole } from "../stores/auth";

/**
 * /users/:id is admin/manager-only (see router/routes.ts) — a rep viewing a
 * note/history entry authored by a manager would otherwise get redirected
 * away by the router guard if EntityLink pointed there unconditionally. Used
 * everywhere a staff user's name (note author, audit log actor, ...) is
 * rendered via EntityLink.
 */
export function userDetailLink(role: UserRole | undefined | null, userId: string | null | undefined): RouteLocationRaw | null {
  if (!userId) return null;
  if (role !== "admin" && role !== "manager") return null;
  return { name: "user-detail", params: { id: userId } };
}

/**
 * A lead's institution is a plain string (no organization_id FK on `lead`),
 * so this links to the HCO list filtered by name rather than a specific
 * HCO's own detail page — was duplicated identically in LeadsView.vue and
 * LeadDetailView.vue.
 */
export function hcoListLink(institutionName: string): RouteLocationRaw {
  return { path: "/hco", query: { institution: institutionName } };
}
