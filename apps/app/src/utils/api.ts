/**
 * ## Error notification display (do not change)
 * When the API returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows ONLY the
 * extracted string. Never show raw JSON in the notification. See foundation/docs/OBSERVABILITY_AND_LOGGING.md.
 */
import { createApiFetch, extractErrorMessage, type ApiFetchOptions } from "@api";
import { getApiUrl } from "../constants";
import { useNotifications } from "../composables/useNotifications";

export type { ApiFetchOptions };
export { extractErrorMessage };

export async function sendDiagnostic(message: string, stack: string, meta: Record<string, unknown> = {}) {
  try {
    await fetch(`${getApiUrl()}/api/diagnostics`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "error", message: message.slice(0, 500), stack: stack.slice(0, 2000), source: "frontend", metadata: meta }),
    });
  } catch { /* ignore */ }
}

async function sendErrorLog(path: string, status: number, message: string) {
  try {
    await fetch(`${getApiUrl()}/api/diagnostics`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "error", message: `API ${status} ${path}: ${message.slice(0, 500)}`, source: "frontend", metadata: { path, status } }),
    });
  } catch { /* ignore */ }
}

export const apiFetch = createApiFetch({
  getApiBase: getApiUrl,
  onError: (path, status, message, errorMessageKey) => {
    const toShow = errorMessageKey ? message : `Request failed: ${status} ${path}`;
    useNotifications().show(toShow, "error", errorMessageKey);
    void sendErrorLog(path, status, message);
  },
});
