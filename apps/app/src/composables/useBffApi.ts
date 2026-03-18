/**
 * Central BFF API client: fetch with credentials, global error handling, and optional logging to tbl_console_logs.
 * Use for all BFF calls so errors show a notification and (in dev/prod when enabled) appear in Directus tbl_console_errors.
 *
 * ## Error notification display (do not change)
 * When the BFF returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows ONLY the
 * extracted string (e.g. "Database not available. Ensure Postgres is running and DATABASE_URL is set.").
 * Never show raw JSON in the notification. See foundation/docs/OBSERVABILITY_AND_LOGGING.md.
 */
import { getBffUrl } from "../constants";
import { useNotifications } from "./useNotifications";

export interface BffFetchOptions extends Omit<RequestInit, "credentials"> {
  /** If true (default), failed responses trigger a notification and POST /api/logs for errors. */
  handleErrors?: boolean;
  /** Optional i18n key for the error notification. */
  errorMessageKey?: string;
}

/**
 * Fetch from BFF with credentials. On non-ok response: show notification and send error to POST /api/logs
 * so it appears in tbl_console_errors (when BFF has ENABLE_CONSOLE_LOG_DB=1 or production).
 */
export async function bffFetch(path: string, options: BffFetchOptions = {}): Promise<Response> {
  const { handleErrors = true, errorMessageKey, ...init } = options;
  const url = `${getBffUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { ...init, credentials: "include" });

  if (!res.ok && handleErrors) {
    const notifications = useNotifications();
    const clone = res.clone();
    let bodyText = "";
    try {
      bodyText = await clone.text();
    } catch {
      bodyText = "";
    }
    let message = bodyText || res.statusText || `HTTP ${res.status}`;
    /* Extract error/message from JSON – never show raw JSON in notification */
    try {
      const json = JSON.parse(bodyText) as Record<string, unknown>;
      if (json && typeof json === "object") {
        const err = json.error ?? json.message;
        if (typeof err === "string" && err.trim()) {
          message = err.trim();
        }
      }
    } catch {
      /* bodyText is not JSON, use as-is */
    }
    /* If message still looks like JSON, try to extract error/message (e.g. double-encoded) */
    if (typeof message === "string" && message.trim().startsWith("{")) {
      try {
        const inner = JSON.parse(message) as Record<string, unknown>;
        if (inner && typeof inner === "object") {
          const err = inner.error ?? inner.message;
          if (typeof err === "string" && err.trim()) {
            message = err.trim();
          }
        }
      } catch {
        /* ignore */
      }
    }
    const fallback = errorMessageKey ? undefined : `Request failed: ${res.status} ${path}`;
    const toShow = fallback ?? (typeof message === "string" ? message : String(message));
    notifications.show(toShow, "error", errorMessageKey);

    try {
      await fetch(`${getBffUrl()}/api/logs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "error",
          message: `API ${res.status} ${path}: ${message.slice(0, 500)}`,
          source: "frontend",
          metadata: { path, status: res.status },
        }),
      });
    } catch {
      // ignore log send failure
    }
  }

  return res;
}
