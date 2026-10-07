import { computed, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { navRoutesForRole, navTitleKey } from "../router/routes";
import { useAuthStore } from "../stores/auth";
import { useRolePreviewStore } from "../stores/rolePreview";
import { doctorPanelEnabled, loadDoctorPanelEnabled } from "./useDoctorPanelSwitch";
import { isPlatformAdminUser, loadPlatformAdmin } from "./usePlatformAdmin";

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
  const role = computed(() => rolePreviewStore.previewRole ?? authStore.user?.role);

  // NEO-233: a doctor's "Panel" entry appears only once its per-tenant switch is known to be on.
  watchEffect(() => {
    if (role.value === "doctor" && authStore.user?.id) void loadDoctorPanelEnabled(authStore.user.id);
  });

  // CORE-177: platformOnly entries (the work board) appear once the admin is known to be a platform admin.
  watchEffect(() => {
    if (role.value === "admin" && authStore.user?.id) void loadPlatformAdmin(authStore.user.id);
  });

  const visibleNavRoutes = computed(() =>
    navRoutesForRole(role.value).filter(
      (r) =>
        !(r.name === "dashboard" && role.value === "doctor" && !doctorPanelEnabled.value) &&
        !(r.platformOnly && (role.value !== "admin" || !isPlatformAdminUser.value)),
    ),
  );

  const visibleNavItems = computed(() =>
    visibleNavRoutes.value.map((r) => ({ path: r.path, name: r.name, label: t(navTitleKey(r.name)) })),
  );

  return { visibleNavRoutes, visibleNavItems };
}
