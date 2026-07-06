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
  tenant?: string;
}

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

/**
 * Auth store — JWT access + refresh token pattern.
 *
 * Access token  → Pinia ref (JS memory only, never localStorage/cookie).
 *                 Attached as "Authorization: Bearer <token>" by apiFetch.
 * Refresh token → httpOnly cookie, managed by browser, never readable by JS.
 *                 Sent automatically to /api/v1/auth/refresh.
 *
 * Lifecycle:
 *   Login   → POST /auth/login  → { access_token, expires_in }
 *   Request → apiFetch adds Authorization header from accessToken ref
 *   401     → apiFetch calls tryRefresh() → new access_token, retry
 *   Reload  → accessToken gone (memory) → fetchSession() calls tryRefresh()
 *   Logout  → POST /auth/logout (revokes DB refresh token) → clearAuth()
 */
export function createAuthStore(apiFetch: ApiFetchFn) {
  return defineStore("auth", () => {
    // ── State ───────────────────────────────────────────────────────────────
    const _accessToken    = ref<string | null>(null);
    const user            = ref<AuthUser | null>(null);
    const sessionChecked  = ref(false);
    const isRefreshing    = ref(false);

    // Single in-flight refresh promise — all concurrent callers await the same one
    let _refreshPromise: Promise<string | null> | null = null;
    let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Computed ────────────────────────────────────────────────────────────
    const isAuthenticated = computed(() => !!_accessToken.value && !!user.value);
    const displayName     = computed(() => user.value?.name ?? user.value?.email ?? null);
    const accessToken     = computed(() => _accessToken.value);

    // ── Helpers ─────────────────────────────────────────────────────────────
    function _scheduleRefresh(expiresInSeconds: number) {
      if (_refreshTimer) clearTimeout(_refreshTimer);
      const delayMs = Math.max((expiresInSeconds - 60) * 1000, 30_000);
      _refreshTimer = setTimeout(() => void tryRefresh(), delayMs);
    }

    function _clearTimer() {
      if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    }

    async function _fetchMe(): Promise<void> {
      // _accessToken.value is always set before _fetchMe() is called (in setTokens / tryRefresh).
      // We pass the Bearer header explicitly here so the auth store's own apiFetch call works
      // regardless of whether the app-level interceptor (setAuthInterceptor) has been registered.
      const token = _accessToken.value;
      try {
        const res = await apiFetch("/api/v1/auth/me", {
          handleErrors: false,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          user.value = (await res.json()) as AuthUser;
        } else {
          user.value = null;
          _accessToken.value = null;
        }
      } catch {
        user.value = null;
        _accessToken.value = null;
      }
    }

    // ── Actions ─────────────────────────────────────────────────────────────

    /** Call after login / Google callback. Stores token, schedules refresh, fetches user. */
    async function setTokens(token: string, expiresIn: number): Promise<void> {
      _accessToken.value = token;
      _scheduleRefresh(expiresIn);
      await _fetchMe();
      sessionChecked.value = true;
    }

    /**
     * Silent refresh via httpOnly cookie.
     * All concurrent callers share one in-flight Promise — no duplicate requests.
     */
    async function tryRefresh(): Promise<string | null> {
      if (_refreshPromise) return _refreshPromise;
      _refreshPromise = (async (): Promise<string | null> => {
        isRefreshing.value = true;
        try {
          const res = await apiFetch("/api/v1/auth/refresh", {
            method: "POST",
            handleErrors: false,
          });
          if (!res.ok) { clearAuth(); return null; }
          const data = (await res.json()) as { access_token: string; expires_in: number };
          _accessToken.value = data.access_token;
          _scheduleRefresh(data.expires_in);
          if (!user.value) await _fetchMe();
          sessionChecked.value = true;
          return data.access_token;
        } catch {
          clearAuth();
          return null;
        } finally {
          isRefreshing.value = false;
          _refreshPromise = null;
        }
      })();
      return _refreshPromise;
    }

    /** On app mount: restore session from httpOnly cookie after page reload. */
    async function fetchSession(): Promise<boolean> {
      const token = await tryRefresh();
      sessionChecked.value = true;
      return !!token;
    }

    async function logout(): Promise<void> {
      try {
        await apiFetch("/api/v1/auth/logout", { method: "POST", handleErrors: false });
      } catch { /* ignore network errors on logout */ }
      clearAuth();
    }

    function clearAuth(): void {
      _accessToken.value = null;
      user.value = null;
      sessionChecked.value = true;
      _clearTimer();
    }

    /** Used by Google OIDC callback Vue route to set auth directly. */
    function setAuthenticated(value: boolean, userData?: AuthUser | null): void {
      sessionChecked.value = true;
      if (!value) { clearAuth(); return; }
      user.value = userData ?? null;
    }

    return {
      accessToken,         // computed readonly — apiFetch reads this
      user,
      sessionChecked,
      isAuthenticated,
      isRefreshing,
      displayName,
      setTokens,
      tryRefresh,
      fetchSession,
      logout,
      clearAuth,
      setAuthenticated,
    };
  });
}
