import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { apiFetch } from "../utils/api";

export type UserRole = "admin" | "manager" | "rep";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  role?: UserRole;
}

/**
 * Auth state for rep-app. Session is validated via API GET /auth/session.
 * Router guard calls fetchSession() before allowing access to protected routes.
 * In dev, "Login as" + "Go to app" can set authenticated without API.
 */
export const useAuthStore = defineStore("auth", () => {
  const isAuthenticated = ref(false);
  const user = ref<AuthUser | null>(null);
  /** True after first fetchSession() this page load; avoids repeated calls. */
  const sessionChecked = ref(false);

  const displayName = computed(() => user.value?.name ?? user.value?.email ?? null);

  /**
   * Call API GET /auth/session (with credentials). Updates isAuthenticated and user.
   * Returns true if session is valid, false otherwise. Sets sessionChecked to true.
   */
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
