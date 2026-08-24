import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ApiFetchOptions } from "@api";

export type UserRole = "admin" | "manager" | "kam" | "msl" | "rep" | "doctor";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  role?: UserRole;
  tenant?: string;
  country_code?: string;
  region?: string;
  language?: string;
}

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

/** Reads/writes the bearer token client-side storage (localStorage — see apps/pwa's
 *  useApi.ts). Threaded in rather than imported directly so this package stays
 *  browser-storage-agnostic. */
export interface AuthTokenStorage {
  get(): string | null;
  set(token: string | null): void;
}

/**
 * Auth store — bearer-JWT based.
 *
 * The API server (apps/api) issues a signed JWT on login; this store keeps a copy in
 * `tokenStorage` (localStorage on the pwa) and mirrors the decoded user in memory. Every
 * apiFetch call attaches the token as `Authorization: Bearer <token>` (see apps/pwa's
 * useApi.ts) — there is no cookie involved, which is the whole point: a cross-origin
 * SameSite cookie between the pwa and API domains gets silently dropped by Safari/iOS's
 * third-party-cookie blocking, which used to leave users looking logged-in with no real
 * session data on iPhone.
 *
 * Lifecycle:
 *   Login   → POST /auth/login  → { token, user, forcePasswordChange } → token persisted
 *   Reload  → fetchSession() calls GET /auth/session (Authorization header from storage) to rehydrate `user`
 *   Logout  → POST /auth/logout (no server-side state to destroy) → clearAuth() drops the token
 */
export function createAuthStore(apiFetch: ApiFetchFn, tokenStorage: AuthTokenStorage) {
  return defineStore("auth", () => {
    // ── State ───────────────────────────────────────────────────────────────
    const user = ref<AuthUser | null>(null);
    const sessionChecked = ref(false);

    // ── Computed ────────────────────────────────────────────────────────────
    const isAuthenticated = computed(() => !!user.value);
    const displayName = computed(() => user.value?.name ?? user.value?.email ?? null);

    // ── Actions ─────────────────────────────────────────────────────────────

    /** On app mount: restore user from the stored bearer token after a page reload. */
    async function fetchSession(): Promise<boolean> {
      try {
        if (!tokenStorage.get()) {
          user.value = null;
          return false;
        }
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
      tokenStorage.set(null);
    }

    /** Used after a successful login/OAuth-exchange response to set the authenticated user and token directly. */
    function setAuthenticated(value: boolean, userData?: AuthUser | null, token?: string): void {
      sessionChecked.value = true;
      if (!value) { clearAuth(); return; }
      user.value = userData ?? null;
      if (token) tokenStorage.set(token);
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
