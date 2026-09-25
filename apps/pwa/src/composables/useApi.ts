/**
 * ## Error notification display (do not change)
 * When the API returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows ONLY the
 * extracted string. Never show raw JSON in the notification. See foundation/docs/OBSERVABILITY_AND_LOGGING.md.
 *
 * ## Auth (ADR-020 — see docs/ADR-020-auth-token-rotation-no-cookies.md)
 * Two tokens, zero cookies anywhere (not just as a preference — cross-origin cookies
 * between this app's domain and the API's are what silently broke Safari/iOS sessions
 * before; see auth-token.spec.ts on the API side for the regression guard).
 *
 * - Access token: short-lived (15m), held only in the `accessToken` module variable
 *   below — never persisted, gone on reload by design. Sent as `Authorization: Bearer`.
 * - Refresh token: longer-lived (7d/30d), persisted in localStorage (APP_STORAGE_KEYS.refreshToken)
 *   so a reload doesn't force a re-login. Rotated on every use — see refreshAccessToken().
 *
 * fetchWithAuth attaches the access token to every request; on a 401 from a non-auth
 * endpoint it tries exactly one silent refresh (concurrent 401s share the same in-flight
 * refresh call via refreshPromise, so a burst of requests on boot never races two refresh
 * calls against the same rotating token — the second would look like token reuse and kill
 * the session). Only if that also fails does it clear both tokens and notify the auth store
 * so the router guard redirects to /login. Register the store-clear callback via
 * setAuthInterceptor() — called from stores/auth.ts after store creation.
 */
import { useLocalStorage } from "@vueuse/core";
import { ApiError, classifyStatus, createApiFetch, extractErrorMessage, reportCaught, type ApiFetchOptions } from "@api";
import { useGlobalLoaderStore } from "@stores";
import { getApiUrl, APP_STORAGE_KEYS } from "../constants";
import { useNotifications } from "../composables/useNotifications";

export type { ApiFetchOptions };
export { extractErrorMessage };

let accessToken: string | null = null;
const refreshToken = useLocalStorage<string | null>(APP_STORAGE_KEYS.refreshToken, null);

export function getAuthToken(): string | null {
  return accessToken;
}

export function setAuthToken(token: string): void {
  accessToken = token;
}

export function clearAuthToken(): void {
  accessToken = null;
}

export function getRefreshToken(): string | null {
  return refreshToken.value;
}

export function setRefreshToken(token: string | null): void {
  refreshToken.value = token;
}

// Registered lazily from stores/auth.ts to avoid circular imports.
let _clearAuth: (() => void) | null = null;

export function setAuthInterceptor(opts: { clearAuth: () => void }): void {
  _clearAuth = opts.clearAuth;
}

/** Auth endpoints are excluded so a 401 from one of these itself doesn't trigger a refresh
 *  attempt or clear the store mid-flow. */
const AUTH_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/google",
  "/api/v1/auth/logout",
  "/api/v1/auth/refresh",
];

function isAuthPath(url: string): boolean {
  return AUTH_PATHS.some((p) => url.includes(p));
}

/** At most one refresh in flight at a time — see the module doc comment above for why a
 *  second concurrent call would be fatal (rotation makes it look like token reuse). Every
 *  caller that 401s while a refresh is already running just awaits the same promise. */
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const current = refreshToken.value;
    if (!current) return false;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current }),
        // Same ceiling as every other request (REQUEST_TIMEOUT_MS below) — a hung
        // refresh would otherwise block every 401-retrying caller behind refreshPromise.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        accessToken = null;
        refreshToken.value = null;
        return false;
      }
      const data = (await res.json()) as { token: string; refresh_token: string };
      accessToken = data.token;
      refreshToken.value = data.refresh_token;
      return true;
    } catch (err) {
      // Network error / timeout, not an auth rejection — leave the refresh token alone so
      // the next request can simply try again rather than forcing a real re-login.
      reportCaught(err, { where: "useApi.refreshAccessToken", level: "warn" });
      return false;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * No caller passes its own `init.signal` today, but a request that never
 * settles (server hangs, not just errors) would otherwise never reject
 * either — every awaiter downstream (loadData(), the router guard's
 * fetchSession(), ...) just hangs forever with it, with nothing to catch.
 * A hard ceiling here guarantees every request eventually settles one way
 * or another, so those callers' own try/catch/finally can actually run.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Fetch wrapper: on a 401 from a non-auth endpoint, tries one silent token refresh
 * and retries the request before giving up and clearing the local auth store. Also
 * drives the global loader store so any in-flight apiFetch call is reflected
 * app-wide (AppButton reads this to disable itself while busy).
 */
async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  if (init?.signal) {
    if (init.signal.aborted) timeoutController.abort();
    else init.signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
  }

  function buildHeaders(): Headers {
    const headers = new Headers(init?.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    return headers;
  }

  const loader = useGlobalLoaderStore();
  loader.startLoading();
  try {
    let res = await fetch(input, { ...init, headers: buildHeaders(), signal: timeoutController.signal });

    if (res.status === 401 && !isAuthPath(url)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(input, { ...init, headers: buildHeaders(), signal: timeoutController.signal });
      }
      if (res.status === 401) {
        clearAuthToken();
        refreshToken.value = null;
        _clearAuth?.();
      }
    }

    return res;
  } finally {
    clearTimeout(timeoutId);
    loader.stopLoading();
  }
}

export const apiFetch = createApiFetch({
  getApiBase: getApiUrl,
  fetchFn: fetchWithAuth,
  onError: (path, status, message, errorMessageKey, info) => {
    // errorMessageKey (when the caller provides one) wins — AppNotifications.vue
    // translates it. `message` (the server's own error text, or a generic
    // "HTTP <code>" fallback — see extractErrorMessage) is always passed too,
    // as what shows if the key is absent or fails to resolve.
    const toShow = message || `Request failed: ${status} ${path}`;
    useNotifications().show(toShow, "error", errorMessageKey, { icon: "sad-cloud" });
    // Every non-2xx apiFetch response is reported here, exactly once (NEO-81) —
    // callers' own `!res.ok` branches don't need to report the same failure again.
    reportCaught(
      new ApiError({
        kind: classifyStatus(status),
        message,
        status,
        code: info?.code ?? null,
        requestId: info?.requestId ?? null,
        path,
        method: info?.method ?? null,
      }),
      { where: "apiFetch" },
    );
  },
});
