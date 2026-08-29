/**
 * ## Error notification display (do not change)
 * When the API returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows ONLY the
 * extracted string. Never show raw JSON in the notification. See foundation/docs/OBSERVABILITY_AND_LOGGING.md.
 *
 * ## Auth
 * Auth is bearer-JWT based (not cookies — cross-origin session cookies get silently
 * dropped by Safari/iOS's third-party-cookie blocking, which is what this replaced). The
 * token lives in localStorage (see APP_STORAGE_KEYS.authToken) so it survives a reload or a
 * backgrounded PWA. fetchWithAuth attaches it as `Authorization: Bearer <token>` on every
 * request, and on a 401 from a non-auth endpoint clears both the token and the local auth
 * store so the router guard redirects to /login. Register the store-clear callback via
 * setAuthInterceptor() — called from stores/auth.ts after store creation.
 */
import { useLocalStorage } from "@vueuse/core";
import { createApiFetch, extractErrorMessage, type ApiFetchOptions } from "@api";
import { useGlobalLoaderStore } from "@stores";
import { getApiUrl, APP_STORAGE_KEYS } from "../constants";
import { useNotifications } from "../composables/useNotifications";

export type { ApiFetchOptions };
export { extractErrorMessage };

// ── Auth token storage ────────────────────────────────────────────────────────
const authToken = useLocalStorage<string | null>(APP_STORAGE_KEYS.authToken, null);

export function getAuthToken(): string | null {
  return authToken.value;
}

export function setAuthToken(token: string): void {
  authToken.value = token;
}

export function clearAuthToken(): void {
  authToken.value = null;
}

// ── Auth interceptor callback ─────────────────────────────────────────────────
// Registered lazily from stores/auth.ts to avoid circular imports.
let _clearAuth: (() => void) | null = null;

export function setAuthInterceptor(opts: { clearAuth: () => void }): void {
  _clearAuth = opts.clearAuth;
}

/** Auth endpoints are excluded so a 401 from /auth/login itself doesn't clear the store mid-login. */
const AUTH_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/google",
  "/api/v1/auth/logout",
];

// Now that Authorization carries the token, `credentials: "include"` from createApiFetch
// (apps/api/client/src/index.ts) is vestigial for this app (no cookies to send) but harmless
// — left as-is since it's a shared package apps/web also uses.

function isAuthPath(url: string): boolean {
  return AUTH_PATHS.some((p) => url.includes(p));
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
 * Fetch wrapper: on 401 from a non-auth endpoint, clear the local auth store.
 * Also drives the global loader store so any in-flight apiFetch call is
 * reflected app-wide (AppButton reads this to disable itself while busy).
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

  const headers = new Headers(init?.headers);
  if (authToken.value) headers.set("Authorization", `Bearer ${authToken.value}`);

  const loader = useGlobalLoaderStore();
  loader.startLoading();
  try {
    const res = await fetch(input, { ...init, headers, signal: timeoutController.signal });

    if (res.status === 401 && !isAuthPath(url)) {
      clearAuthToken();
      _clearAuth?.();
    }

    return res;
  } finally {
    clearTimeout(timeoutId);
    loader.stopLoading();
  }
}

// ── Diagnostics helpers ───────────────────────────────────────────────────────

export async function sendDiagnostic(
  message: string,
  stack: string,
  meta: Record<string, unknown> = {},
) {
  try {
    await fetch(`${getApiUrl()}/api/v1/diagnostics`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: message.slice(0, 500),
        stack: stack.slice(0, 2000),
        source: "frontend",
        metadata: meta,
      }),
    });
  } catch { /* ignore */ }
}

async function sendErrorLog(path: string, status: number, message: string) {
  try {
    await fetch(`${getApiUrl()}/api/v1/diagnostics`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: `API ${status} ${path}: ${message.slice(0, 500)}`,
        source: "frontend",
        metadata: { path, status },
      }),
    });
  } catch { /* ignore */ }
}

// ── Public apiFetch instance ──────────────────────────────────────────────────

export const apiFetch = createApiFetch({
  getApiBase: getApiUrl,
  fetchFn: fetchWithAuth,
  onError: (path, status, message, errorMessageKey) => {
    // errorMessageKey (when the caller provides one) wins — AppNotifications.vue
    // translates it. `message` (the server's own error text, or a generic
    // "HTTP <code>" fallback — see extractErrorMessage) is always passed too,
    // as what shows if the key is absent or fails to resolve.
    const toShow = message || `Request failed: ${status} ${path}`;
    useNotifications().show(toShow, "error", errorMessageKey);
    void sendErrorLog(path, status, message);
  },
});
