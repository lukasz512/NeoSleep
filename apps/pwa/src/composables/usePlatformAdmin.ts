import { ref } from "vue";
import { fetchPlatformAdmin } from "./useIssues";

/**
 * Whether the signed-in admin is also a platform admin (platform.users: the NeoSleep team,
 * not a tenant's staff). Gates the `platformOnly` nav entries, e.g. the work board (CORE-177).
 * Read once per signed-in user; a failed check means "no".
 */
export const isPlatformAdminUser = ref(false);

let cache: { userId: string; result: Promise<boolean> } | null = null;

export function loadPlatformAdmin(userId: string): Promise<boolean> {
  if (cache?.userId === userId) return cache.result;
  const result = fetchPlatformAdmin()
    .catch(() => false)
    .then((ok) => {
      isPlatformAdminUser.value = ok;
      return ok;
    });
  cache = { userId, result };
  return result;
}

export function __resetPlatformAdminForTests(): void {
  cache = null;
  isPlatformAdminUser.value = false;
}
