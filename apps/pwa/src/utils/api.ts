/**
 * ## Error notification display (do not change)
 * When the API returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows ONLY the
 * extracted string. Never show raw JSON in the notification. See foundation/docs/OBSERVABILITY_AND_LOGGING.md.
 *
 * ## Auth interceptor
 * Auth is session-cookie based (browser sends it automatically — see credentials:
 * "include" in createApiFetch). fetchWithAuth's only job is: on a 401 from a
 * non-auth endpoint, clear the local auth store so the router guard redirects
 * to /login. Register the callback via setAuthInterceptor() — called from
 * stores/auth.ts after store creation.
 */
import { createApiFetch, extractErrorMessage, type ApiFetchOptions } from "@api";
import { getApiUrl } from "../constants";
import { useNotifications } from "../composables/useNotifications";

export type { ApiFetchOptions };
export { extractErrorMessage };

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

function isAuthPath(url: string): boolean {
  return AUTH_PATHS.some((p) => url.includes(p));
}

/** Fetch wrapper: on 401 from a non-auth endpoint, clear the local auth store. */
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

  const res = await fetch(input, init);

  if (res.status === 401 && !isAuthPath(url)) {
    _clearAuth?.();
  }

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
    // errorMessageKey (when the caller provides one) wins — AppNotifications.vue
    // translates it. `message` (the server's own error text, or a generic
    // "HTTP <code>" fallback — see extractErrorMessage) is always passed too,
    // as what shows if the key is absent or fails to resolve.
    const toShow = message || `Request failed: ${status} ${path}`;
    useNotifications().show(toShow, "error", errorMessageKey);
    void sendErrorLog(path, status, message);
  },
});
