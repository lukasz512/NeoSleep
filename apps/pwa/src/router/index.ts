import { createRouter, createWebHistory } from "vue-router";
import { routes, isRoleAllowed, appHomePath } from "./routes";
import { useAuthStore } from "../stores/auth";
import { useRolePreviewStore } from "../stores/rolePreview";
import type { UserRole } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

const isDev = import.meta.env.DEV;

/**
 * Auth guard: app starts at login; protected routes require valid session (API).
 * - Root "/" redirects to /login (route config); authenticated users are redirected from /login to /dashboard.
 * - requiresAuth: ensure session is checked (fetchSession), then allow or redirect to /login?redirect=.
 */
router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();
  const rolePreview = useRolePreviewStore();

  if (to.meta.devOnly) {
    if (isDev) {
      next();
      return;
    }
    next({ path: "/login" });
    return;
  }

  if (to.meta.public) {
    if (to.path === "/login" || to.path === "/forgot-password") {
      if (!auth.sessionChecked) await auth.fetchSession();
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
    if (!auth.sessionChecked) {
      await auth.fetchSession();
    }
    if (!auth.isAuthenticated) {
      next({ path: "/login", query: { redirect: to.fullPath } });
      return;
    }
    // Admin's "view as" preview (rolePreview.ts) is respected here too — only for
    // navigation, so testing as another role actually redirects like the real
    // thing would. It never affects auth.user?.role itself, so every API call
    // still runs with the real, unaffected permissions underneath.
    const roles = to.meta.roles as UserRole[] | undefined;
    const effectiveRole = rolePreview.previewRole ?? auth.user?.role;
    if (!isRoleAllowed(roles, effectiveRole)) {
      next({ path: appHomePath });
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
