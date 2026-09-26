import { createRouter, createWebHistory } from "vue-router";
import { routes, isRoleAllowed, homePathForRole } from "./routes";
import { useAuthStore } from "../stores/auth";
import { useRolePreviewStore } from "../stores/rolePreview";
import type { UserRole } from "../stores/auth";
import { ensurePartnerConnection } from "../composables/usePartnerConnection";
import { installPageTransitions } from "./pageTransitions";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

const isDev = import.meta.env.DEV;

/** How long /login and /forgot-password wait for the session check before showing the form anyway. */
export const SESSION_CHECK_BUDGET_MS = 2500;

/**
 * Auth guard: app starts at login; protected routes require valid session (API).
 * - Root "/" redirects to /login (route config); authenticated users are redirected from /login to /patients.
 * - requiresAuth: ensure session is checked (fetchSession), then allow or redirect to /login?redirect=.
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const rolePreview = useRolePreviewStore();

  if (to.meta.devOnly) {
    if (isDev) {
      return true;
    }
    return { path: "/login" };
  }

  if (to.meta.public) {
    if (to.path === "/login" || to.path === "/forgot-password") {
      const redirect = typeof to.query.redirect === "string" && to.query.redirect ? to.query.redirect : "/patients";
      if (!auth.sessionChecked) {
        // Never hold the login form hostage to a slow API (Render cold start,
        // bad mobile network — up to apiFetch's 20s timeout). Past the budget,
        // show the form now and let the check finish in the background; if it
        // does find a valid session, move on to the app from there.
        const check = auth.fetchSession();
        const settledInTime = await Promise.race([
          check.then(() => true),
          new Promise<false>((resolve) => setTimeout(() => resolve(false), SESSION_CHECK_BUDGET_MS)),
        ]);
        if (!settledInTime) {
          void check.then((authenticated) => {
            if (authenticated && router.currentRoute.value.meta.public) {
              void router.replace({ path: redirect, query: {} });
            }
          });
          return true;
        }
      }
      if (auth.isAuthenticated) {
        return { path: redirect, query: {} };
      }
    }
    return true;
  }

  if (to.meta.requiresAuth) {
    if (!auth.sessionChecked) {
      await auth.fetchSession();
    }
    if (!auth.isAuthenticated) {
      return { path: "/login", query: { redirect: to.fullPath } };
    }
    // Admin's "view as" preview (rolePreview.ts) is respected here too — only for
    // navigation, so testing as another role actually redirects like the real
    // thing would. It never affects auth.user?.role itself, so every API call
    // still runs with the real, unaffected permissions underneath.
    const roles = to.meta.roles as UserRole[] | undefined;
    const effectiveRole = rolePreview.previewRole ?? auth.user?.role;
    if (!isRoleAllowed(roles, effectiveRole)) {
      return { path: homePathForRole(effectiveRole) };
    }

    // Fire-and-forget: retries the partner connection if it's down and
    // (rate-limited) notifies on failure — never blocks or delays the
    // navigation itself. See usePartnerConnection.ts.
    const partner = to.meta.partner as string | undefined;
    if (partner) void ensurePartnerConnection(partner);

    return true;
  }

  return true;
});

// NEO-85: list → record → back slides, module switches fade through.
installPageTransitions(router);

/** Trace view navigation in dev (from → to, route name). */
if (isDev) {
  router.afterEach((to, from) => {
    const fromView = from.name ?? (from.path || "/");
    const toView = to.name ?? (to.path || "/");
    console.log(`[router] ${String(fromView)} → ${String(toView)} (${to.fullPath})`);
  });
}

export default router;
export { routes, appNavRoutes, appHomePath, homePathForRole } from "./routes";
export { PublicLayout, AppLayout } from "./routes";
