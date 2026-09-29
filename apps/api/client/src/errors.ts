/**
 * Typed API errors (NEO-81) — one classification shared by the PWA and the website.
 *
 * `kind` drives what the user is told and whether a cached fallback is safe:
 *   - network       — the request never got an answer (offline, DNS, CORS, connection refused)
 *   - timeout       — the request was aborted after waiting too long
 *   - client        — 4xx other than 429 (bad input, not found, forbidden...)
 *   - rate_limited  — 429
 *   - server        — 5xx
 *   - bad_response  — the server answered 2xx but the body is not what we expect
 *                     (e.g. the SPA's index.html served instead of JSON, invalid JSON)
 *
 * Only `network` and `timeout` mean "we never reached the server", so only
 * those may fall back to offline-cached data (ADR-013).
 */

export type ApiErrorKind = "network" | "timeout" | "client" | "rate_limited" | "server" | "bad_response";

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number | null;
  code?: string | null;
  requestId?: string | null;
  path?: string | null;
  method?: string | null;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Machine-readable code from the API's `{ error, code }` body (AppError.code), when present. */
  readonly code: string | null;
  /** Server-side correlation id from the `X-Request-ID` response header, when present. */
  readonly requestId: string | null;
  /** API path without query string (query strings can carry search terms — PII). */
  readonly path: string | null;
  readonly method: string | null;

  constructor(init: ApiErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.requestId = init.requestId ?? null;
    this.path = init.path ? stripQuery(init.path) : null;
    this.method = init.method ?? null;
  }

  /** True when the request never reached the server — the only case an offline cache may stand in. */
  get isOffline(): boolean {
    return this.kind === "network" || this.kind === "timeout";
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function stripQuery(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/** Maps an HTTP error status to its class. Callers only pass non-2xx statuses. */
export function classifyStatus(status: number): ApiErrorKind {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  if (status >= 400) return "client";
  // 0 / 1xx / 3xx reaching an error path: an opaque or redirected response we can't use.
  return "bad_response";
}

function isAbortLike(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

// Chrome: "Failed to fetch"; Firefox: "NetworkError when attempting to fetch resource.";
// Safari: "Load failed"; undici/Node: "fetch failed".
const FETCH_TYPE_ERROR_RE = /fetch|network|load failed/i;

/**
 * Normalises an error thrown by `fetch()` / `res.json()` into an ApiError.
 * Only call it on errors from those two calls — a TypeError from an unrelated
 * code bug must not be mistaken for "offline". Already-typed errors pass
 * through unchanged. `fetch` rejects with TypeError for every transport failure
 * (offline, DNS, CORS) and with AbortError/TimeoutError when a signal fires; a
 * SyntaxError means `res.json()` got something that isn't JSON.
 */
export function toApiError(err: unknown, ctx: { path?: string; method?: string } = {}): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const base = { path: ctx.path ?? null, method: ctx.method ?? null, cause: err };
  if (isAbortLike(err)) return new ApiError({ kind: "timeout", message: message || "Request timed out", ...base });
  if (err instanceof TypeError && FETCH_TYPE_ERROR_RE.test(message)) {
    return new ApiError({ kind: "network", message, ...base });
  }
  if (err instanceof SyntaxError) return new ApiError({ kind: "bad_response", message: `Invalid JSON: ${message}`, ...base });
  return new ApiError({ kind: "bad_response", message: message || "Unexpected response", ...base });
}

/** True only for a request that never reached the server (offline/DNS/CORS/timeout) — the one case a cache may stand in. */
export function isOfflineError(err: unknown): boolean {
  return err instanceof ApiError && err.isOffline;
}

/** Reads `.error`/`.message` and `.code` off a parsed JSON body — the shape every route in this API returns errors as. */
function pickErrorFields(value: unknown): { message?: string; code?: string; field?: string } {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const text = record.error ?? record.message;
  const code = record.code;
  const field = record.field;
  return {
    message: typeof text === "string" && text.trim() ? text.trim() : undefined,
    code: typeof code === "string" && code.trim() ? code.trim() : undefined,
    field: typeof field === "string" && field.trim() ? field.trim() : undefined,
  };
}

/** Unwraps one level of double-encoded JSON (an error string that is itself `{"error": "..."}`). */
export function extractErrorMessage(bodyText: string): string {
  try {
    const outer = pickErrorFields(JSON.parse(bodyText)).message;
    if (!outer) return bodyText;
    if (outer.startsWith("{")) return pickErrorFields(JSON.parse(outer)).message ?? outer;
    return outer;
  } catch {
    // benign: not JSON — e.g. a framework's default HTML error page (404/500 before it
    // ever reaches our JSON error handler). Never show raw markup to the user;
    // the caller falls back to res.statusText / "HTTP <code>" instead.
    const trimmed = bodyText.trim();
    return trimmed.startsWith("<") ? "" : trimmed;
  }
}

/** The API's `code` field from an error body, if the body is JSON and carries one. */
/**
 * The payload key a 400 VALIDATION_ERROR names (NEO-109) — e.g. "date_of_birth" —
 * so a form can mark that field instead of toasting. Null when none is named.
 */
export function extractErrorField(bodyText: string): string | null {
  try {
    return pickErrorFields(JSON.parse(bodyText)).field ?? null;
  } catch {
    // benign: non-JSON error bodies name no field.
    return null;
  }
}

export function extractErrorCode(bodyText: string): string | null {
  try {
    return pickErrorFields(JSON.parse(bodyText)).code ?? null;
  } catch {
    // benign: non-JSON error bodies simply have no code.
    return null;
  }
}

/**
 * Reads a response header defensively — hand-rolled Response stand-ins (tests,
 * service-worker shims) don't always implement `headers`.
 */
export function responseHeader(res: Response, name: string): string | null {
  try {
    return res.headers?.get(name) ?? null;
  } catch {
    // benign: a Response without a usable Headers object simply has no such header.
    return null;
  }
}

function pathOf(res: Response, fallback?: string): string | null {
  if (fallback) return fallback;
  try {
    return res.url ? new URL(res.url).pathname : null;
  } catch {
    // benign: a relative/empty Response.url (e.g. in tests) just means no path.
    return null;
  }
}

/**
 * Builds an ApiError from a non-2xx Response without consuming its body
 * (clones it), so a caller can still read the body afterwards.
 */
export async function apiErrorFromResponse(
  res: Response,
  ctx: { path?: string; method?: string } = {},
): Promise<ApiError> {
  let bodyText = "";
  try {
    bodyText = await res.clone().text();
  } catch {
    // benign: an unreadable (or already consumed / stand-in) body only costs us the
    // server message and code — the status is still known.
  }
  const message = extractErrorMessage(bodyText) || res.statusText || `HTTP ${res.status}`;
  return new ApiError({
    kind: classifyStatus(res.status),
    message,
    status: res.status,
    code: extractErrorCode(bodyText),
    requestId: responseHeader(res, "x-request-id"),
    path: pathOf(res, ctx.path),
    method: ctx.method ?? null,
  });
}

/**
 * Parses a Response as JSON, throwing a typed ApiError when that isn't possible:
 * a non-2xx status (classified by status), or a 2xx whose body is not JSON —
 * e.g. the static host's index.html when VITE_API_URL is missing, which used
 * to surface only as a swallowed SyntaxError.
 */
export async function readJson<T>(res: Response, ctx: { path?: string; method?: string } = {}): Promise<T> {
  if (!res.ok) throw await apiErrorFromResponse(res, ctx);
  try {
    return (await res.json()) as T;
  } catch (err) {
    const contentType = responseHeader(res, "content-type") ?? "";
    const looksLikeHtml =
      contentType.includes("text/html") || (err instanceof SyntaxError && /'<'|<!doctype|<html/i.test(err.message));
    throw new ApiError({
      kind: "bad_response",
      message: looksLikeHtml
        ? `Expected JSON but got HTML (content-type: ${contentType || "none"}) — is the API base URL configured?`
        : `Invalid JSON response (content-type: ${contentType || "none"})`,
      status: res.status,
      requestId: responseHeader(res, "x-request-id"),
      path: pathOf(res, ctx.path),
      method: ctx.method ?? null,
      cause: err,
    });
  }
}
