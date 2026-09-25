/**
 * Which user-facing message fits an error (NEO-81) — pure, framework-free, so
 * both .vue components (via @neo/ui's useErrorText) and plain .ts code
 * (toasts, stores) pick the same i18n keys. Keys live in packages/i18n under
 * `common.error.*`.
 *
 * Only a request that never reached the server is described as a connection
 * problem — a 500 or an HTML-instead-of-JSON response is "a problem on our
 * side" (with a short reference the user can quote to support).
 */
import { isApiError } from "./errors";

export type ErrorMessageClass =
  | "network"
  | "timeout"
  | "server"
  | "notFound"
  | "forbidden"
  | "invalid"
  | "rateLimited"
  | "unexpected";

export interface ErrorMessageKeys {
  cls: ErrorMessageClass;
  title: string;
  body: string;
  /** Short request id to quote to support — only for failures on our side. */
  reference: string | null;
}

/** First block of the request UUID — enough to find the row in diagnostics/logs, short enough to read out. */
export function shortRequestId(id: string | null | undefined): string | null {
  if (!id) return null;
  const head = id.split("-")[0] ?? id;
  return head.slice(0, 12) || null;
}

export function errorClassOf(err: unknown): ErrorMessageClass {
  if (!isApiError(err)) return "unexpected";
  switch (err.kind) {
    case "network":
      return "network";
    case "timeout":
      return "timeout";
    case "rate_limited":
      return "rateLimited";
    case "server":
    case "bad_response":
      return "server";
    case "client":
      if (err.status === 404 || err.status === 410) return "notFound";
      if (err.status === 401 || err.status === 403) return "forbidden";
      return "invalid";
  }
}

export function errorMessageKeys(err: unknown): ErrorMessageKeys {
  const cls = errorClassOf(err);
  const withReference = cls === "server" || cls === "unexpected";
  return {
    cls,
    title: `common.error.${cls}.title`,
    body: `common.error.${cls}.body`,
    reference: withReference && isApiError(err) ? shortRequestId(err.requestId) : null,
  };
}

/**
 * For forms that show one i18n key: the class-specific body when the class says
 * something more useful than the form's own message (connection, timeout,
 * server, rate limit), otherwise the form's own fallback key.
 */
export function errorBodyKeyOr(err: unknown, fallbackKey: string): string {
  const cls = errorClassOf(err);
  if (cls === "network" || cls === "timeout" || cls === "server" || cls === "rateLimited") {
    return `common.error.${cls}.body`;
  }
  return fallbackKey;
}

export interface ErrorText {
  cls: ErrorMessageClass;
  title: string;
  body: string;
  /** Already-formatted "Reference: abc123" line, or "" when there is none. */
  reference: string;
}

/** Resolves the keys with any `t` (vue-i18n's composer or i18n.global.t). */
export function describeError(
  err: unknown,
  t: (key: string, params?: Record<string, unknown>) => string,
): ErrorText {
  const keys = errorMessageKeys(err);
  return {
    cls: keys.cls,
    title: t(keys.title),
    body: t(keys.body),
    reference: keys.reference ? t("common.error.reference", { id: keys.reference }) : "",
  };
}

/** One-line form for toasts: "Title. Body Reference: abc". */
export function describeErrorInline(
  err: unknown,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const text = describeError(err, t);
  return [`${text.title}.`, text.body, text.reference].filter(Boolean).join(" ");
}
