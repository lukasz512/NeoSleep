import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ApiFetchOptions } from "@api";

export type UserRole = "admin" | "manager" | "rep";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  role?: UserRole;
}

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

/**
 * Factory for the auth store. Pass the app's apiFetch wrapper so the store
 * gets the correct error handling and API base URL for each app.
 *
 * @example
 * // apps/app/src/stores/auth.ts
 * import { createAuthStore } from "@stores";
 * import { apiFetch } from "../utils/api";
 * export const useAuthStore = createAuthStore(apiFetch);
 */
export function createAuthStore(apiFetch: ApiFetchFn) {
  return defineStore("auth", () => {
    const isAuthenticated = ref(false);
    const user = ref<AuthUser | null>(null);
    /** True after first fetchSession() this page load; avoids repeated calls. */
    const sessionChecked = ref(false);

    const displayName = computed(() => user.value?.name ?? user.value?.email ?? null);

    async function fetchSession(): Promise<boolean> {
      try {
        const res = await apiFetch("/auth/session", { handleErrors: false });
        sessionChecked.value = true;
        if (res.ok) {
          const data = (await res.json()) as { user?: AuthUser };
          if (data.user) {
            user.value = data.user;
            isAuthenticated.value = true;
            return true;
          }
        }
        user.value = null;
        isAuthenticated.value = false;
        return false;
      } catch {
        sessionChecked.value = true;
        user.value = null;
        isAuthenticated.value = false;
        return false;
      }
    }

    function setAuthenticated(value: boolean, userData?: AuthUser | null) {
      sessionChecked.value = true;
      isAuthenticated.value = value;
      user.value = value && userData ? userData : null;
    }

    function clearAuth() {
      isAuthenticated.value = false;
      user.value = null;
      sessionChecked.value = true;
    }

    return {
      isAuthenticated,
      user,
      sessionChecked,
      displayName,
      fetchSession,
      setAuthenticated,
      clearAuth,
    };
  });
}
