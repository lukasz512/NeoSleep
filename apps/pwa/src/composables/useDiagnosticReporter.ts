/**
 * Diagnostic reporter — captures unhandled JS errors, promise rejections, and Vue errors,
 * then sends them to POST /api/diagnostics via sendDiagnostic.
 *
 * Usage in main.ts:
 *   setupDiagnosticReporter(app)
 */
import type { App } from "vue";
import { sendDiagnostic } from "./useBffApi";

const _recentErrors = new Map<string, number>();

function getErrorMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: typeof window !== "undefined" ? window.location.href : "",
    viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
    app_version: import.meta.env.VITE_APP_VERSION ?? "dev",
    ...extra,
  };
}

function deduped(key: string, fn: () => void, windowMs = 5000): void {
  const now = Date.now();
  if ((_recentErrors.get(key) ?? 0) + windowMs < now) {
    _recentErrors.set(key, now);
    fn();
  }
}

export function setupDiagnosticReporter(app: App): void {
  app.config.errorHandler = (err, instance, info) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? "") : "";
    const component = (instance as { $options?: { name?: string } } | null)?.$options?.name ?? "unknown";
    console.error(`[Vue error] ${info}:`, err);
    deduped(`vue:${info}:${message}`, () => {
      void sendDiagnostic(`[Vue] ${info}: ${message}`, stack, getErrorMeta({ info, component }));
    });
  };

  if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      const message = event.message ?? String(event.error);
      const stack = event.error instanceof Error ? (event.error.stack ?? "") : "";
      deduped(`win:${message}`, () => {
        void sendDiagnostic(`[JS] ${message}`, stack, getErrorMeta({ filename: event.filename, lineno: event.lineno }));
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? (reason.stack ?? "") : "";
      deduped(`promise:${message}`, () => {
        void sendDiagnostic(`[Promise] ${message}`, stack, getErrorMeta({ type: "unhandledrejection" }));
      });
    });
  }
}
