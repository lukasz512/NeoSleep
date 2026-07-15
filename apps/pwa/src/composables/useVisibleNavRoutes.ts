import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { navRoutesForRole, navTitleKey } from "../router/routes";
import { useAuthStore } from "../stores/auth";
import { useRolePreviewStore } from "../stores/rolePreview";

/**
 * The current user's role-filtered nav list, respecting the admin "view as"
 * preview (rolePreview.ts) — single source shared by the sidebar nav
 * (AppNavLinks.vue) and the mobile bottom-nav (AppLayout.vue's AppShell
 * navItems), so both always agree on what's visible.
 */
export function useVisibleNavRoutes() {
  const { t } = useI18n();
  const authStore = useAuthStore();
  const rolePreviewStore = useRolePreviewStore();

  const visibleNavRoutes = computed(() =>
    navRoutesForRole(rolePreviewStore.previewRole ?? authStore.user?.role),
  );

  const visibleNavItems = computed(() =>
    visibleNavRoutes.value.map((r) => ({ path: r.path, name: r.name, label: t(navTitleKey(r.name)) })),
  );

  return { visibleNavRoutes, visibleNavItems };
}
