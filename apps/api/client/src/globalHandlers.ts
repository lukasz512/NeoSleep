/**
 * Global safety net (NEO-81): anything no catch block handled — a Vue render /
 * lifecycle / watcher error, an uncaught exception, an unhandled promise
 * rejection — is logged to the console and reported via reportCaught.
 * Installed by both apps/pwa and apps/web main.ts.
 *
 * Typed structurally (not against Vue's `App`) so this package stays
 * framework-free and plain .ts entry points can import it without pulling
 * .vue files into their type-check.
 */
import { reportCaught } from "./report";

/**
 * The slice of a Vue `App` this needs. `instance: never` makes Vue's real
 * handler signature (instance: ComponentPublicInstance | null) assignable here.
 */
export interface ErrorHandlerHost {
  config: { errorHandler?: (err: unknown, instance: never, info: string) => void };
}

function componentName(instance: unknown): string {
  if (typeof instance !== "object" || instance === null) return "unknown";
  const options = (instance as { $options?: { name?: unknown; __name?: unknown } }).$options;
  const name = options?.name ?? options?.__name;
  return typeof name === "string" ? name : "unknown";
}

/**
 * Browser notifications that surface as window errors but aren't app failures.
 * "ResizeObserver loop ..." is the spec's own benign signal (an observer resized
 * what it observes; the browser just defers the rest to the next frame) — it
 * fired on every PWA page load and would drown real reports.
 */
const IGNORED_WINDOW_ERRORS = [/ResizeObserver loop/];

let windowHandlersInstalled = false;

export function installGlobalErrorHandlers(app: ErrorHandlerHost): void {
  app.config.errorHandler = (err: unknown, instance: unknown, info: string) => {
    reportCaught(err, { where: `vue:${info}`, extra: { component: componentName(instance) } });
  };

  if (typeof window === "undefined" || windowHandlersInstalled) return;
  windowHandlersInstalled = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    // Resource load errors (img/script) bubble here without an Error or a message.
    if (!event.error && !event.message) return;
    if (IGNORED_WINDOW_ERRORS.some((re) => re.test(event.message ?? ""))) return;
    reportCaught(event.error ?? event.message, {
      where: "window.error",
      extra: { filename: event.filename || null, lineno: event.lineno || null },
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    reportCaught(event.reason, { where: "unhandledrejection" });
  });
}
