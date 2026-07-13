import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ApiFetchOptions } from "@api";

export type UserRole = "admin" | "ffm" | "kam" | "msl" | "rep";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  role?: UserRole;
  tenant?: string;
}

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

/**
 * Auth store — session-cookie based.
 *
 * The BFF (apps/api) owns the session: it sets an httpOnly cookie on login
 * and reads it via express-session on every request. This store just mirrors
 * that server-side state in memory — it holds no token, because there is none.
 *
 * Lifecycle:
 *   Login   → POST /auth/login  → { user, forcePasswordChange } (cookie set by browser)
 *   Reload  → fetchSession() calls GET /auth/session to rehydrate `user` from the cookie
 *   Logout  → POST /auth/logout (destroys server session) → clearAuth()
 */
export function createAuthStore(apiFetch: ApiFetchFn) {
  return defineStore("auth", () => {
    // ── State ───────────────────────────────────────────────────────────────
    const user = ref<AuthUser | null>(null);
    const sessionChecked = ref(false);

    // ── Computed ────────────────────────────────────────────────────────────
    const isAuthenticated = computed(() => !!user.value);
    const displayName = computed(() => user.value?.name ?? user.value?.email ?? null);

    // ── Actions ─────────────────────────────────────────────────────────────

    /** On app mount: restore user from the session cookie after a page reload. */
    async function fetchSession(): Promise<boolean> {
      try {
        const res = await apiFetch("/api/v1/auth/session", { handleErrors: false });
        if (res.ok) {
          const data = (await res.json()) as { user: AuthUser };
          user.value = data.user;
        } else {
          user.value = null;
        }
      } catch {
        user.value = null;
      } finally {
        sessionChecked.value = true;
      }
      return !!user.value;
    }

    async function logout(): Promise<void> {
      try {
        await apiFetch("/api/v1/auth/logout", { method: "POST", handleErrors: false });
      } catch { /* ignore network errors on logout */ }
      clearAuth();
    }

    function clearAuth(): void {
      user.value = null;
      sessionChecked.value = true;
    }

    /** Used after login (real or dev-only bypass) to set the authenticated user directly. */
    function setAuthenticated(value: boolean, userData?: AuthUser | null): void {
      sessionChecked.value = true;
      if (!value) { clearAuth(); return; }
      user.value = userData ?? null;
    }

    return {
      user,
      sessionChecked,
      isAuthenticated,
      displayName,
      fetchSession,
      logout,
      clearAuth,
      setAuthenticated,
    };
  });
}
