/**
 * ## Error notification display (do not change)
 * When the API returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows ONLY the
 * extracted string. Never show raw JSON in the notification. See foundation/docs/OBSERVABILITY_AND_LOGGING.md.
 *
 * ## Auth interceptor
 * fetchWithAuth injects `Authorization: Bearer <token>` on every non-auth request.
 * On 401 it calls tryRefresh() once and retries. Auth paths are excluded to prevent loops.
 * Register callbacks via setAuthInterceptor() — called from stores/auth.ts after store creation.
 */
import { createApiFetch, extractErrorMessage, type ApiFetchOptions } from "@api";
import { getApiUrl } from "../constants";
import { useNotifications } from "../composables/useNotifications";

export type { ApiFetchOptions };
export { extractErrorMessage };

// ── Auth interceptor callbacks ────────────────────────────────────────────────
// Registered lazily from stores/auth.ts to avoid circular imports.
// All three are null until setAuthInterceptor() is called (before first API request).
let _getToken:    (() => string | null)            | null = null;
let _tryRefresh:  (() => Promise<string | null>)   | null = null;
let _clearAuth:   (() => void)                     | null = null;

export function setAuthInterceptor(opts: {
  getToken:   () => string | null;
  tryRefresh: () => Promise<string | null>;
  clearAuth:  () => void;
}): void {
  _getToken   = opts.getToken;
  _tryRefresh = opts.tryRefresh;
  _clearAuth  = opts.clearAuth;
}

/**
 * Paths that must NOT get the Bearer header or trigger a refresh retry.
 * refresh  → uses httpOnly cookie
 * login    → credentials exchange, no token yet
 * google/* → OIDC handshake, no token yet
 * logout   → token may already be invalid
 */
const AUTH_PATHS = [
  "/api/v1/auth/refresh",
  "/api/v1/auth/login",
  "/api/v1/auth/google",
  "/api/v1/auth/logout",
];

function isAuthPath(url: string): boolean {
  return AUTH_PATHS.some((p) => url.includes(p));
}

/**
 * Fetch wrapper that:
 *  1. Adds Authorization: Bearer <token> header when a token is available.
 *  2. On 401, calls tryRefresh() and retries once with the new token.
 *  3. On persistent 401, calls clearAuth() so the app redirects to login.
 *
 * Auth endpoints are excluded to prevent infinite refresh loops.
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

  // Pass auth endpoints through without Bearer injection
  if (isAuthPath(url) || !_getToken) {
    return fetch(input, init);
  }

  const token = _getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  if (res.status !== 401 || !_tryRefresh) {
    return res;
  }

  // 401 → attempt silent refresh then retry once
  const newToken = await _tryRefresh();
  if (newToken) {
    headers.set("Authorization", `Bearer ${newToken}`);
    return fetch(input, { ...init, headers });
  }

  // Refresh failed — clear session so the router guard redirects to /login
  _clearAuth?.();
  return res;
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
    const toShow = errorMessageKey ? message : `Request failed: ${status} ${path}`;
    useNotifications().show(toShow, "error", errorMessageKey);
    void sendErrorLog(path, status, message);
  },
});
