import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { reportCaught, reportFailedResponse, type ApiFetchOptions } from "@api";

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

/** Reads/writes the two auth tokens (ADR-020) — access token (short-lived, memory-only)
 *  and refresh token (longer-lived, persisted). Threaded in rather than imported directly
 *  so this package stays browser-storage-agnostic; see apps/pwa's useApi.ts for the real
 *  implementation. */
export interface AuthTokenStorage {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  getRefreshToken(): string | null;
  setRefreshToken(token: string | null): void;
}

/**
 * Auth store — rotating refresh token, zero cookies (ADR-020).
 *
 * The API server (apps/api) issues a short-lived access token plus a refresh token on
 * login. This store keeps the user's decoded identity in memory and delegates the two
 * tokens to `tokenStorage`. Every apiFetch call attaches the access token as
 * `Authorization: Bearer <token>` and silently refreshes it on expiry (see apps/pwa's
 * useApi.ts) — there is no cookie involved, which is deliberate: a cross-origin SameSite
 * cookie between the pwa and API domains gets silently dropped by Safari/iOS's
 * third-party-cookie blocking, which used to leave users looking logged-in with no real
 * session data on iPhone.
 *
 * Lifecycle:
 *   Login   → POST /auth/login  → { token, refresh_token, user, forcePasswordChange } → both tokens persisted
 *   Reload  → fetchSession() calls GET /auth/session; a missing/expired access token is
 *             silently re-derived from the refresh token by apiFetch itself, not here
 *   Logout  → POST /auth/logout (revokes the refresh token server-side) → clearAuth() drops both tokens
 */
export function createAuthStore(apiFetch: ApiFetchFn, tokenStorage: AuthTokenStorage) {
  return defineStore("auth", () => {
    const user = ref<AuthUser | null>(null);
    const sessionChecked = ref(false);
    /** A session check is in flight right now (e.g. still running in the background past the router's wait budget). */
    const sessionChecking = ref(false);

    const isAuthenticated = computed(() => !!user.value);
    const displayName = computed(() => user.value?.name ?? user.value?.email ?? null);

    // The router no longer blocks the login form on a slow session check (see
    // apps/pwa router/index.ts), so a login can now complete while that check
    // is still in flight. authGeneration lets the late check see that and
    // leave the fresh login alone instead of overwriting it with its stale 401.
    let sessionCheck: Promise<boolean> | null = null;
    let authGeneration = 0;

    /** On app mount: the access token is gone (memory-only), but a stored refresh token
     *  means apiFetch's own 401 handling will silently re-derive one — see useApi.ts. */
    async function fetchSession(): Promise<boolean> {
      // Concurrent callers (router guard + a background re-check) share one request.
      sessionChecking.value = true;
      sessionCheck ??= runSessionCheck().finally(() => {
        sessionCheck = null;
        sessionChecking.value = false;
      });
      return sessionCheck;
    }

    async function runSessionCheck(): Promise<boolean> {
      const generation = authGeneration;
      const stale = () => generation !== authGeneration;
      try {
        if (!tokenStorage.getRefreshToken()) {
          user.value = null;
          return false;
        }
        const res = await apiFetch("/api/v1/auth/session", { handleErrors: false });
        if (stale()) return !!user.value;
        if (res.ok) {
          const data = (await res.json()) as { user: AuthUser };
          if (stale()) return !!user.value;
          user.value = data.user;
        } else if (res.status === 401 || res.status === 403) {
          // The session itself is gone — the only answer that means "signed out".
          user.value = null;
        } else {
          // 5xx / 429: our side failed, the session may be fine. Keep whoever is
          // signed in (a background re-check must not sign a rep out because the
          // API hiccuped); at boot there is no user yet, so the guard still sends
          // them to /login exactly as before.
          await reportFailedResponse(res, { where: "authStore.runSessionCheck" });
        }
      } catch (err) {
        // Same for a network blip / timeout: keep the current user, report, and let
        // the next check (or request) decide. Never sign out on "couldn't ask".
        reportCaught(err, { where: "authStore.runSessionCheck" });
      } finally {
        sessionChecked.value = true;
      }
      return !!user.value;
    }

    async function logout(): Promise<void> {
      try {
        await apiFetch("/api/v1/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: tokenStorage.getRefreshToken() }),
          handleErrors: false,
        });
      } catch {
        // benign: the server-side revoke failed (offline) — local tokens are cleared below regardless.
      }
      clearAuth();
    }

    function clearAuth(): void {
      authGeneration++;
      user.value = null;
      sessionChecked.value = true;
      tokenStorage.setAccessToken(null);
      tokenStorage.setRefreshToken(null);
    }

    /** Used after a successful login/OAuth-exchange response to set the authenticated user and both tokens directly. */
    function setAuthenticated(value: boolean, userData?: AuthUser | null, token?: string, refreshToken?: string): void {
      authGeneration++;
      sessionChecked.value = true;
      if (!value) { clearAuth(); return; }
      user.value = userData ?? null;
      if (token) tokenStorage.setAccessToken(token);
      if (refreshToken) tokenStorage.setRefreshToken(refreshToken);
    }

    return {
      user,
      sessionChecked,
      sessionChecking,
      isAuthenticated,
      displayName,
      fetchSession,
      logout,
      clearAuth,
      setAuthenticated,
    };
  });
}
