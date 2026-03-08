import DefaultLayout from "../layouts/DefaultLayout.vue";
import AppLayout from "../layouts/AppLayout.vue";
export { DefaultLayout, AppLayout };
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import DevView from "../views/DevView.vue";
import LeadsView from "../views/LeadsView.vue";
import LeadDetailView from "../views/LeadDetailView.vue";
import HCPView from "../views/HCPView.vue";
import HCPDetailView from "../views/HCPDetailView.vue";
import HCOView from "../views/HCOView.vue";
import HCODetailView from "../views/HCODetailView.vue";
import PlannerView from "../views/PlannerView.vue";
import PresentationsView from "../views/PresentationsView.vue";
/** App starts at login; root and unknown paths send unauthenticated users to /login. */
export const routes = [
    { path: "/", redirect: "/login" },
    { path: "/login", name: "login", component: LoginView, meta: { layout: "default", public: true } },
    { path: "/dev", name: "dev", component: DevView, meta: { layout: "app", devOnly: true } },
    { path: "/dashboard", name: "dashboard", component: DashboardView, meta: { layout: "app", requiresAuth: true } },
    { path: "/leads", name: "leads", component: LeadsView, meta: { layout: "app", requiresAuth: true } },
    { path: "/leads/:id", name: "lead-detail", component: LeadDetailView, meta: { layout: "app", requiresAuth: true } },
    { path: "/planner", name: "planner", component: PlannerView, meta: { layout: "app", requiresAuth: true } },
    { path: "/hcp", name: "hcp", component: HCPView, meta: { layout: "app", requiresAuth: true } },
    { path: "/hcp/:id", name: "hcp-detail", component: HCPDetailView, meta: { layout: "app", requiresAuth: true } },
    { path: "/hco", name: "hco", component: HCOView, meta: { layout: "app", requiresAuth: true } },
    { path: "/hco/:id", name: "hco-detail", component: HCODetailView, meta: { layout: "app", requiresAuth: true } },
    { path: "/presentations", name: "presentations", component: PresentationsView, meta: { layout: "app", requiresAuth: true } },
    { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
];
/** App layout nav: one source of truth for sidebar/drawer links; derived from routes. */
/** List/dashboard routes only (no detail routes like /leads/:id). */
export const appNavRoutes = routes
    .filter((r) => typeof r.path === "string" &&
    !r.path.includes(":") &&
    r.path !== "/" &&
    r.path !== "/login" &&
    r.path !== "/dev" &&
    typeof r.name === "string" &&
    r.meta?.layout === "app" &&
    !r.meta?.devOnly)
    .map((r) => ({ path: r.path, name: r.name }));
/** Home path for app layout (logo link). Same as first app nav route. */
export const appHomePath = appNavRoutes[0]?.path ?? "/dashboard";
