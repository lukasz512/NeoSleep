/**
 * Opens/clears the per-session IndexedDB read cache in step with the auth
 * session — see docs/ADR-013-offline-read-cache.md. One database per
 * (tenant, userId); switching users or logging out must never leave a
 * previous session's cached HCP/HCO/lead/user records reachable on a shared
 * device.
 */
import { watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { openCacheDb, clearCacheDb } from "../utils/offlineCache";

export function setupOfflineCacheSession(): void {
  const authStore = useAuthStore();
  let lastSession: { tenant: string; userId: string } | null = null;

  watch(
    () => authStore.user,
    (user) => {
      const next = user?.tenant && user.id ? { tenant: user.tenant, userId: user.id } : null;

      if (
        lastSession &&
        (!next || lastSession.tenant !== next.tenant || lastSession.userId !== next.userId)
      ) {
        void clearCacheDb(lastSession.tenant, lastSession.userId);
      }

      lastSession = next;
      if (next) void openCacheDb(next.tenant, next.userId);
    },
    { immediate: true },
  );
}
