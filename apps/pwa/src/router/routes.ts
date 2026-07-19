import type { RouteRecordRaw } from "vue-router";
import PublicLayout from "../layouts/PublicLayout.vue";
import AppLayout from "../layouts/AppLayout.vue";
import type { UserRole } from "../stores/auth";

export { PublicLayout, AppLayout };

const ALL_STAFF_ROLES: UserRole[] = ["rep", "doctor", "manager", "admin"];

/** App starts at login; root and unknown paths send unauthenticated users to /login. */
// Nav order: leads, hcp, hco, patients, planner, presentations, users — the
// mobile bottom bar (AppShell) shows exactly the first 4 of whatever's
// visible for the current role. appNavRoutes below derives from this array's
// order — reordering here reorders both the sidebar and the bottom bar.
// "dashboard" stays a real route (default post-login landing page, logo
// link target) but is deliberately excluded from the nav lists below —
// same treatment as /login and /dev.
// Each app-layout route carries a `roles` meta — AppNavLinks.vue filters the
// sidebar by it, and the router guard (router/index.ts) enforces it: visiting
// a route directly with the wrong role redirects to /dashboard instead of
// rendering the view. admin always bypasses this (see isRoleAllowed) — sees
// every view regardless of what's listed here.
// /login, /forgot-password and /reset-password all share this one lazy-import
// reference (not separate `() => import(...)` closures per path) so Vue
// Router resolves them to the literal same async component — RouterView then
// reuses the mounted instance across navigation between them instead of
// remounting it. That's what keeps the card shell, logo and settings icon
// (AuthChrome/AuthCard, rendered once inside AuthView.vue) on screen the
// whole time — only the inner step content transitions. See AuthView.vue.
const authViewComponent = () => import("../views/LoginView.vue");

export const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/login" },
  { path: "/login", name: "login", component: authViewComponent, meta: { layout: "public", public: true } },
  { path: "/forgot-password", name: "forgot-password", component: authViewComponent, meta: { layout: "public", public: true } },
  { path: "/reset-password", name: "reset-password", component: authViewComponent, meta: { layout: "public", public: true } },
  { path: "/change-password", name: "change-password", component: () => import("../views/ChangePasswordView.vue"), meta: { layout: "public", requiresAuth: true } },
  { path: "/dev", name: "dev", component: () => import("../views/DevView.vue"), meta: { layout: "app", devOnly: true } },
  { path: "/leads", name: "leads", component: () => import("../views/LeadsView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["rep"] } },
  { path: "/leads/:id", name: "lead-detail", component: () => import("../views/LeadDetailView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["rep"] } },
  { path: "/hcp", name: "hcp", component: () => import("../views/HCPView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["rep", "manager", "admin"] } },
  { path: "/hcp/:id", name: "hcp-detail", component: () => import("../views/HCPDetailView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["rep", "manager", "admin"] } },
  { path: "/hco", name: "hco", component: () => import("../views/HCOView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["rep", "manager", "admin"] } },
  { path: "/hco/:id", name: "hco-detail", component: () => import("../views/HCODetailView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["rep", "manager", "admin"] } },
  { path: "/patients", name: "patients", component: () => import("../views/PatientsView.vue"), meta: { layout: "app", requiresAuth: true, roles: ALL_STAFF_ROLES } },
  { path: "/patients/:id", name: "patient-detail", component: () => import("../views/PatientDetailView.vue"), meta: { layout: "app", requiresAuth: true, roles: ALL_STAFF_ROLES } },
  { path: "/planner", name: "planner", component: () => import("../views/PlannerView.vue"), meta: { layout: "app", requiresAuth: true, roles: ALL_STAFF_ROLES } },
  { path: "/presentations", name: "presentations", component: () => import("../views/PresentationsView.vue"), meta: { layout: "app", requiresAuth: true, roles: ALL_STAFF_ROLES } },
  { path: "/dashboard", name: "dashboard", component: () => import("../views/DashboardView.vue"), meta: { layout: "app", requiresAuth: true, roles: ALL_STAFF_ROLES } },
  { path: "/users", name: "users", component: () => import("../views/UsersView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["admin", "manager"] } },
  { path: "/users/:id", name: "user-detail", component: () => import("../views/UserDetailView.vue"), meta: { layout: "app", requiresAuth: true, roles: ["admin", "manager"] } },
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
];

/** App layout nav: one source of truth for sidebar/drawer + bottom-bar links; derived from routes. */
/** List routes only (no detail routes like /leads/:id, and no /dashboard — see comment above). */
export const appNavRoutes = routes
  .filter(
    (r): r is (typeof routes)[number] & { path: string; name: string } =>
      typeof r.path === "string" &&
      !r.path.includes(":") &&
      r.path !== "/" &&
      r.path !== "/login" &&
      r.path !== "/dev" &&
      r.path !== "/dashboard" &&
      typeof (r as { name?: string }).name === "string" &&
      (r.meta as { layout?: string; devOnly?: boolean } | undefined)?.layout === "app" &&
      !(r.meta as { devOnly?: boolean } | undefined)?.devOnly,
  )
  .map((r) => ({
    path: r.path,
    name: (r as { name: string }).name,
    roles: (r.meta as { roles?: UserRole[] } | undefined)?.roles,
  }));

/** Undefined `roles` means "visible/allowed to all". admin always bypasses — sees every view. */
export function isRoleAllowed(roles: UserRole[] | undefined, role: UserRole | undefined | null): boolean {
  return !roles || role === "admin" || (!!role && roles.includes(role));
}

/** Nav routes visible to the given role. */
export function navRoutesForRole(role: UserRole | undefined | null) {
  return appNavRoutes.filter((r) => isRoleAllowed(r.roles, role));
}

/**
 * Home path for the app layout (logo link) — always the dashboard, independent
 * of nav display order (nav order is a display concern, not a "what is home" one).
 */
export const appHomePath = routes.find((r) => (r as { name?: string }).name === "dashboard")?.path ?? "/dashboard";

/** Returns the i18n key for a nav route name. Every entry follows `user.<name>.title`. */
export function navTitleKey(name: string): string {
  return `user.${name}.title`;
}

/** Detail route name → its parent list route name, for resolving nav icons on detail pages. */
const detailRouteParents: Record<string, string> = {
  "lead-detail": "leads",
  "hcp-detail": "hcp",
  "hco-detail": "hco",
  "patient-detail": "patients",
  "user-detail": "users",
};

/**
 * Returns the AppIcon name (e.g. `nav-leads`) for a route, reusing the same
 * sidebar/bottom-nav icon on detail pages. Undefined for routes with no nav
 * entry (dashboard, login, dev, ...) — AppIcon has no icon registered for those.
 */
export function navIconName(name: string): string | undefined {
  const listName = detailRouteParents[name] ?? name;
  return appNavRoutes.some((r) => r.name === listName) ? `nav-${listName}` : undefined;
}
