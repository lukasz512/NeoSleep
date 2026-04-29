import type { RouteRecordRaw } from "vue-router";
import PublicLayout from "../layouts/PublicLayout.vue";
import AppLayout from "../layouts/AppLayout.vue";

export { PublicLayout, AppLayout };

/** App starts at login; root and unknown paths send unauthenticated users to /login. */
export const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/login" },
  { path: "/login", name: "login", component: () => import("../views/LoginView.vue"), meta: { layout: "public", public: true } },
  { path: "/dev", name: "dev", component: () => import("../views/DevView.vue"), meta: { layout: "app", devOnly: true } },
  { path: "/dashboard", name: "dashboard", component: () => import("../views/DashboardView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/leads", name: "leads", component: () => import("../views/LeadsView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/leads/:id", name: "lead-detail", component: () => import("../views/LeadDetailView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/planner", name: "planner", component: () => import("../views/PlannerView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/hcp", name: "hcp", component: () => import("../views/HCPView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/hcp/:id", name: "hcp-detail", component: () => import("../views/HCPDetailView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/hco", name: "hco", component: () => import("../views/HCOView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/hco/:id", name: "hco-detail", component: () => import("../views/HCODetailView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/patients", name: "patients", component: () => import("../views/PatientsView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/presentations", name: "presentations", component: () => import("../views/PresentationsView.vue"), meta: { layout: "app", requiresAuth: true } },
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
];

/** App layout nav: one source of truth for sidebar/drawer links; derived from routes. */
/** List/dashboard routes only (no detail routes like /leads/:id). */
export const appNavRoutes = routes
  .filter(
    (r): r is (typeof routes)[number] & { path: string; name: string } =>
      typeof r.path === "string" &&
      !r.path.includes(":") &&
      r.path !== "/" &&
      r.path !== "/login" &&
      r.path !== "/dev" &&
      typeof (r as { name?: string }).name === "string" &&
      (r.meta as { layout?: string; devOnly?: boolean } | undefined)?.layout === "app" &&
      !(r.meta as { devOnly?: boolean } | undefined)?.devOnly,
  )
  .map((r) => ({ path: r.path, name: (r as { name: string }).name }));

/** Home path for app layout (logo link). Same as first app nav route. */
export const appHomePath = appNavRoutes[0]?.path ?? "/dashboard";

/** Overrides for route names whose i18n key doesn't follow the `user.<name>.title` convention. */
const NAV_TITLE_KEY_OVERRIDES: Record<string, string> = {
  patients: "app.patients.title",
};

/** Returns the i18n key for a nav route name. */
export function navTitleKey(name: string): string {
  return NAV_TITLE_KEY_OVERRIDES[name] ?? `user.${name}.title`;
}
