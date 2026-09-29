/**
 * Error toast worded by error class (NEO-81) — "Can't reach the server…" for
 * a dropped connection, "Something went wrong on our side… Reference: abc"
 * for a server failure — for catch blocks that have no more specific message.
 * Reporting stays the caller's job (reportCaught), so a toast is never the
 * only trace of a failure.
 */
import { describeErrorInline } from "@api";
import { i18n } from "../plugins/i18n";
import { useNotifications } from "./useNotifications";

type ToastOptions = Parameters<ReturnType<typeof useNotifications>["show"]>[3];

export function showErrorToast(err: unknown, options?: ToastOptions): void {
  const message = describeErrorInline(err, (key, params) => i18n.global.t(key, params ?? {}));
  useNotifications().show(message, "error", undefined, options);
}
