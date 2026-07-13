import { createRouter, createWebHistory } from "vue-router";
import { routes } from "./routes";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

const isDev = import.meta.env.DEV;

/**
 * Auth guard: app starts at login; protected routes require valid session (API).
 * - Root "/" redirects to /login (route config); authenticated users are redirected from /login to /dashboard.
 * - requiresAuth: ensure session is checked (fetchSession), then allow or redirect to /login?redirect=.
 * - In dev, session check is skipped so "Login as" + "Go to app" works without API.
 */
router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();

  if (to.meta.devOnly) {
    if (isDev) {
      next();
      return;
    }
    next({ path: "/login" });
    return;
  }

  if (to.meta.public) {
    if (to.path === "/login") {
      if (!isDev && !auth.sessionChecked) await auth.fetchSession();
      if (auth.isAuthenticated) {
        const redirect = typeof to.query.redirect === "string" && to.query.redirect ? to.query.redirect : "/dashboard";
        next({ path: redirect, query: {} });
        return;
      }
    }
    next();
    return;
  }

  if (to.meta.requiresAuth) {
    if (isDev) {
      if (!auth.isAuthenticated) {
        next({ path: "/login", query: to.path !== "/login" ? { redirect: to.fullPath } : {} });
        return;
      }
      next();
      return;
    }
    if (!auth.sessionChecked) {
      await auth.fetchSession();
    }
    if (!auth.isAuthenticated) {
      next({ path: "/login", query: { redirect: to.fullPath } });
      return;
    }
    next();
    return;
  }

  next();
});

/** Trace view navigation in dev (from → to, route name). */
if (isDev) {
  router.afterEach((to, from) => {
    const fromView = from.name ?? (from.path || "/");
    const toView = to.name ?? (to.path || "/");
    console.log(`[router] ${String(fromView)} → ${String(toView)} (${to.fullPath})`);
  });
}

export default router;
export { routes, appNavRoutes, appHomePath } from "./routes";
export { PublicLayout, AppLayout } from "./routes";
