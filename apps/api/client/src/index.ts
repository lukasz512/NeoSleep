import { extractErrorCode, extractErrorField, extractErrorMessage, responseHeader, stripQuery, toApiError } from "./errors";

export * from "./errors";
export * from "./report";
export * from "./globalHandlers";
export * from "./errorMessage";

export interface ApiFetchOptions extends Omit<RequestInit, "credentials"> {
  handleErrors?: boolean;
  errorMessageKey?: string;
}

/** Extra context about a non-2xx response, passed as onError's 5th argument (NEO-81). */
export interface ApiErrorInfo {
  /** The API's machine-readable `code`, when the error body carries one. */
  code: string | null;
  /** Server-side correlation id from the `X-Request-ID` response header. */
  requestId: string | null;
  method: string;
  /** The form field a 400 VALIDATION_ERROR names (NEO-109), when it names one. */
  field: string | null;
}

export interface ApiClientConfig {
  getApiBase: () => string;
  onError?: (path: string, status: number, message: string, errorMessageKey?: string, info?: ApiErrorInfo) => void;
  /** Optional custom fetch implementation (e.g. auth-aware interceptor). Defaults to global fetch. */
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Returns `apiFetch(path, options)`:
 *   - transport failures (offline, DNS, CORS, timeout) reject with a typed
 *     `ApiError` (kind "network" | "timeout") — it is still an `Error`, so
 *     existing `catch` blocks keep working, but they can now branch on `.kind`;
 *   - HTTP error statuses still resolve with the `Response` (callers check
 *     `res.ok`), after logging and calling `onError` with the server message,
 *     `code` and `X-Request-ID`. Use `readJson(res)` / `apiErrorFromResponse(res)`
 *     to turn a failed Response into an `ApiError`.
 */
export function createApiFetch(config: ApiClientConfig) {
  const fetchImpl = config.fetchFn ?? fetch;
  return async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
    const { handleErrors = true, errorMessageKey, ...init } = options;
    const base = config.getApiBase();
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const method = init.method ?? "GET";
    // Query strings can carry search terms typed by the user (names, phone numbers) — never log them.
    const logPath = stripQuery(path);

    let res: Response;
    try {
      // Defense-in-depth alongside the server's Cache-Control: no-store — every API response is
      // per-session, so the browser's own HTTP cache must never serve a response from one session
      // to another (this is what previously let a device show a stale, different user's data).
      res = await fetchImpl(url, { ...init, credentials: "include", cache: "no-store" });
    } catch (err) {
      const apiErr = toApiError(err, { path: logPath, method });
      // A TypeError that isn't a fetch transport failure is a bug in fetchFn — surface it as-is.
      if (apiErr.kind !== "network" && apiErr.kind !== "timeout") throw err;
      console.error(`[api] ${method} ${logPath} — ${apiErr.kind} error`, err);
      throw apiErr;
    }

    if (!res.ok) {
      // benign: an unreadable error body only costs the server message; the status is still logged.
      const bodyText = await res.clone().text().catch(() => "");
      const message = extractErrorMessage(bodyText) || res.statusText || `HTTP ${res.status}`;
      const requestId = responseHeader(res, "x-request-id");
      console.error(`[api] ${method} ${logPath} — ${res.status} ${message}${requestId ? ` (request ${requestId})` : ""}`);
      if (handleErrors && config.onError) {
        config.onError(path, res.status, message, errorMessageKey, {
          code: extractErrorCode(bodyText),
          requestId,
          method,
          field: extractErrorField(bodyText),
        });
      }
    }

    return res;
  };
}

