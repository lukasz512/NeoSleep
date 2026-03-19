/**
 * ## Error notification display (do not change)
 * When the API returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows ONLY the
 * extracted string. Never show raw JSON in the notification. See foundation/docs/OBSERVABILITY_AND_LOGGING.md.
 */
import { getApiUrl } from "../constants";
import { useNotifications } from "../composables/useNotifications";

export interface ApiFetchOptions extends Omit<RequestInit, "credentials"> {
  handleErrors?: boolean;
  errorMessageKey?: string;
}

function extractErrorMessage(bodyText: string): string {
  try {
    const json = JSON.parse(bodyText) as Record<string, unknown>;
    const err = json.error ?? json.message;
    if (typeof err === "string" && err.trim()) {
      if (err.trim().startsWith("{")) {
        const inner = JSON.parse(err) as Record<string, unknown>;
        const innerErr = inner.error ?? inner.message;
        if (typeof innerErr === "string" && innerErr.trim()) return innerErr.trim();
      }
      return err.trim();
    }
  } catch { /* not JSON */ }
  return bodyText;
}

async function sendErrorLog(path: string, status: number, message: string) {
  try {
    await fetch(`${getApiUrl()}/api/logs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "error", message: `API ${status} ${path}: ${message.slice(0, 500)}`, source: "frontend", metadata: { path, status } }),
    });
  } catch { /* ignore */ }
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { handleErrors = true, errorMessageKey, ...init } = options;
  const res = await fetch(`${getApiUrl()}${path.startsWith("/") ? path : `/${path}`}`, { ...init, credentials: "include" });

  if (!res.ok && handleErrors) {
    const bodyText = await res.clone().text().catch(() => "");
    const message = extractErrorMessage(bodyText) || res.statusText || `HTTP ${res.status}`;
    const toShow = errorMessageKey ? message : `Request failed: ${res.status} ${path}`;
    useNotifications().show(toShow, "error", errorMessageKey);
    await sendErrorLog(path, res.status, message);
  }

  return res;
}
