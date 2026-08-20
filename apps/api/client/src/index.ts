export interface ApiFetchOptions extends Omit<RequestInit, "credentials"> {
  handleErrors?: boolean;
  errorMessageKey?: string;
}

export interface ApiClientConfig {
  getApiBase: () => string;
  onError?: (path: string, status: number, message: string, errorMessageKey?: string) => void;
  /** Optional custom fetch implementation (e.g. auth-aware interceptor). Defaults to global fetch. */
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/** Reads `.error`/`.message` off a parsed JSON body — the shape every route in this API returns errors as. */
function pickErrorField(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>).error ?? (value as Record<string, unknown>).message;
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

/** Unwraps one level of double-encoded JSON (an error string that is itself `{"error": "..."}`). */
export function extractErrorMessage(bodyText: string): string {
  try {
    const outer = pickErrorField(JSON.parse(bodyText));
    if (!outer) return bodyText;
    if (outer.startsWith("{")) return pickErrorField(JSON.parse(outer)) ?? outer;
    return outer;
  } catch {
    // Not JSON — e.g. a framework's default HTML error page (404/500 before it
    // ever reaches our JSON error handler). Never show raw markup to the user;
    // the caller falls back to res.statusText / "HTTP <code>" instead.
    const trimmed = bodyText.trim();
    return trimmed.startsWith("<") ? "" : trimmed;
  }
}

export function createApiFetch(config: ApiClientConfig) {
  const fetchImpl = config.fetchFn ?? fetch;
  return async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
    const { handleErrors = true, errorMessageKey, ...init } = options;
    const base = config.getApiBase();
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const method = init.method ?? "GET";

    let res: Response;
    try {
      // Defense-in-depth alongside the server's Cache-Control: no-store — every API response is
      // per-session, so the browser's own HTTP cache must never serve a response from one session
      // to another (this is what previously let a device show a stale, different user's data).
      res = await fetchImpl(url, { ...init, credentials: "include", cache: "no-store" });
    } catch (err) {
      console.error(`[api] ${method} ${path} — network error`, err);
      throw err;
    }

    if (!res.ok) {
      const bodyText = await res.clone().text().catch(() => "");
      const message = extractErrorMessage(bodyText) || res.statusText || `HTTP ${res.status}`;
      console.error(`[api] ${method} ${path} — ${res.status} ${message}`);
      if (handleErrors && config.onError) config.onError(path, res.status, message, errorMessageKey);
    }

    return res;
  };
}
