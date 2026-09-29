/**
 * reportCaught — the one place a caught error goes (NEO-81).
 *
 * Every catch that isn't a documented benign case calls this. It:
 *   1. writes one `console.error` with context (so a developer with DevTools open
 *      always sees *something*), and
 *   2. POSTs a scrubbed report to `POST /api/v1/diagnostics` (fire-and-forget,
 *      never throws, deduped for 5 s per identical error).
 *
 * Privacy (GDPR / LFPDPPP): never send request/form bodies, tokens, or
 * user-identifying values. The payload is limited to: scrubbed message,
 * scrubbed stack, `where`, error class/status/code/requestId, API path
 * without query string, page path without query string or #fragment (the
 * fragment carries the patient questionnaire's single-use credential), app
 * name/version, viewport. `extra` accepts primitives only, and string values
 * are scrubbed too. Emails, phone-like digit runs, bearer tokens and JWTs are
 * replaced before anything leaves the browser.
 *
 * Framework-agnostic on purpose: packages/stores and packages/ui use it too.
 * The Vue/window global handlers live in @neo/ui (installGlobalErrorHandlers).
 */
import { apiErrorFromResponse, isApiError, stripQuery, type ApiError } from "./errors";

export type ReportExtra = Record<string, string | number | boolean | null | undefined>;

export interface ReportContext {
  /** Stable, human-readable location, e.g. "HCODetailView.load" or "web.ContactView.submit". */
  where: string;
  /** Extra non-PII context. Primitives only; strings are scrubbed. */
  extra?: ReportExtra;
  /**
   * "error" or "warn" (degraded-but-working states, e.g. a map that failed while
   * the list works). Defaults to "warn" for offline/timeout ApiErrors — the
   * device lost its connection, nothing to fix on our side — and "error" otherwise.
   */
  level?: "error" | "warn";
}

export interface ErrorReportingConfig {
  getApiBase: () => string;
  /** "pwa" | "web" — lets diagnostics rows be filtered per app. */
  app: string;
  appVersion?: string;
  /** Disable the network report (tests, local debugging). Console logging always stays on. */
  sendToServer?: boolean;
}

export interface DiagnosticPayload {
  level: "error" | "warn";
  message: string;
  stack: string;
  source: "frontend";
  request_id: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

const DEDUPE_WINDOW_MS = 5000;
const DIAGNOSTICS_PATH = "/api/v1/diagnostics";

let config: ErrorReportingConfig | null = null;
const recent = new Map<string, number>();

export function configureErrorReporting(next: ErrorReportingConfig): void {
  config = next;
}

/** Test helper — forget configuration and dedupe state. */
export function resetErrorReportingForTests(): void {
  config = null;
  recent.clear();
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
// 7+ digits, optionally separated by spaces/dashes/dots/parentheses, optional leading + — phone numbers.
const PHONE_RE = /\+?\(?\d(?:[\s.\-()]*\d){6,}/g;
const URL_QUERY_RE = /(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi;

/** Removes values that can identify a person or grant access. Exported for tests. */
export function scrubPii(text: string): string {
  return text
    .replace(URL_QUERY_RE, "$1")
    .replace(JWT_RE, "[token]")
    .replace(BEARER_RE, "Bearer [token]")
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[number]");
}

function pagePath(): string {
  if (typeof window === "undefined" || !window.location) return "";
  return `${window.location.origin}${window.location.pathname}`;
}

function describe(err: unknown): { message: string; stack: string; api: ApiError | null } {
  if (isApiError(err)) return { message: err.message, stack: err.stack ?? "", api: err };
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack ?? "", api: null };
  if (typeof err === "string") return { message: err, stack: "", api: null };
  try {
    return { message: JSON.stringify(err) ?? String(err), stack: "", api: null };
  } catch {
    // benign: circular/unserialisable values fall back to their string form.
    return { message: String(err), stack: "", api: null };
  }
}

/** Builds the diagnostics payload. Pure and exported so tests can assert exactly what leaves the browser. */
export function buildDiagnosticPayload(err: unknown, ctx: ReportContext): DiagnosticPayload {
  const { message, stack, api } = describe(err);
  const metadata: Record<string, string | number | boolean | null> = {
    where: ctx.where,
    app: config?.app ?? "unknown",
    app_version: config?.appVersion ?? "dev",
    url: pagePath(),
  };
  if (typeof window !== "undefined" && typeof window.innerWidth === "number") {
    metadata.viewport = `${window.innerWidth}x${window.innerHeight}`;
  }
  if (api) {
    metadata.kind = api.kind;
    metadata.status = api.status;
    metadata.code = api.code;
    metadata.path = api.path ? stripQuery(api.path) : null;
    metadata.method = api.method;
  }
  for (const [key, value] of Object.entries(ctx.extra ?? {})) {
    if (value === undefined) continue;
    metadata[`x_${key}`] = typeof value === "string" ? scrubPii(value).slice(0, 300) : value;
  }
  return {
    level: levelOf(err, ctx),
    message: scrubPii(`[${ctx.where}] ${message}`).slice(0, 500),
    stack: scrubPii(stack).slice(0, 2000),
    source: "frontend",
    request_id: api?.requestId ?? null,
    metadata,
  };
}

function levelOf(err: unknown, ctx: ReportContext): "error" | "warn" {
  if (ctx.level) return ctx.level;
  return isApiError(err) && err.isOffline ? "warn" : "error";
}

function isOfflineNow(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Fire-and-forget POST to the diagnostics endpoint. Never throws. */
export function sendDiagnosticPayload(payload: DiagnosticPayload): void {
  if (!config || config.sendToServer === false) return;
  if (typeof fetch === "undefined" || isOfflineNow()) return;
  let url: string;
  try {
    url = `${config.getApiBase()}${DIAGNOSTICS_PATH}`;
  } catch {
    // benign: no API base resolvable (misconfigured build) — the console.error already happened.
    return;
  }
  // Plain fetch, never apiFetch: a failing report must not re-enter the error pipeline.
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "omit",
    keepalive: true,
  }).catch(() => {
    // benign: reporting is best effort; the error itself was already logged to the console.
  });
}

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  recent.set(key, now);
  if (recent.size > 200) {
    for (const [k, t] of recent) if (now - t >= DEDUPE_WINDOW_MS) recent.delete(k);
  }
  return true;
}

/** Log + report a caught error. Never throws. */
export function reportCaught(err: unknown, ctx: ReportContext): void {
  const { message } = describe(err);
  const api = isApiError(err) ? err : null;
  const label = api
    ? `[${ctx.where}] ${api.kind}${api.status ? ` ${api.status}` : ""}${api.code ? ` ${api.code}` : ""}${api.requestId ? ` (request ${api.requestId})` : ""}`
    : `[${ctx.where}]`;
  try {
    if (levelOf(err, ctx) === "warn") console.warn(label, err);
    else console.error(label, err);
  } catch {
    // benign: a console that throws (exotic embedded webviews) must never break the caller.
  }
  if (!shouldSend(`${ctx.where}|${message}`)) return;
  try {
    sendDiagnosticPayload(buildDiagnosticPayload(err, ctx));
  } catch {
    // benign: building/sending the report is best effort and must never throw into a catch block.
  }
}

/**
 * For a non-2xx Response the caller handles itself (`handleErrors: false`, so
 * apiFetch's onError did not report it): builds the typed ApiError, reports it,
 * and returns it for the caller's error state.
 */
export async function reportFailedResponse(
  res: Response,
  ctx: ReportContext & { path?: string; method?: string },
): Promise<ApiError> {
  const err = await apiErrorFromResponse(res, { path: ctx.path, method: ctx.method });
  reportCaught(err, ctx);
  return err;
}
