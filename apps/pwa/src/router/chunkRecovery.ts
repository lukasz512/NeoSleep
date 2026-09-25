import type { Router } from "vue-router";
import type { NotificationType, ShowOptions } from "../composables/useNotifications";

/**
 * Recovery from "stale chunk" failures after a deploy.
 *
 * Every build gives lazy-loaded views new hashed file names
 * (PatientDetailView-<hash>.js). A tab opened before a deploy still runs the
 * old bundle, so its next lazy import asks for a file that no longer exists —
 * the import rejects, the navigation is cancelled, and without this module the
 * click just silently does nothing ("the app froze").
 *
 * Fix: detect that specific failure, tell the user (a toast counting down the
 * RELOAD_DELAY_MS, so the reload never comes as a surprise), then do a full
 * page load of the page they were trying to open, which fetches the new index.html and the
 * new chunks. A sessionStorage marker stops this from becoming a reload loop
 * when the chunk is genuinely unreachable (network down, broken deploy) — the
 * second failure inside RELOAD_GUARD_MS shows an error toast instead.
 */

export const RELOAD_GUARD_KEY = "neo:chunk-reload-at";
export const RELOAD_GUARD_MS = 30_000;
/** Long enough to read the "new version — reloading in N s" toast before the page goes away. */
export const RELOAD_DELAY_MS = 5_000;
/** One failure reaches both hooks moments apart — only the first one counts. */
const DUPLICATE_WINDOW_MS = 1_000;

// Chrome/Edge, Safari (network failure, then HTML served instead of JS),
// Firefox and Vite's own CSS-preload wording, in that order. Each one is
// covered by e2e/stale-chunk.spec.ts on its real engine.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /is not a valid JavaScript MIME type/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
];

export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

export interface ChunkRecoveryDeps {
  notify: (message: string, type: NotificationType, key?: string, options?: ShowOptions) => void;
  reload: (url: string) => void;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  isOnline: () => boolean;
  now: () => number;
  schedule: (fn: () => void, ms: number) => void;
}

export type ChunkRecoveryOutcome = "reloading" | "offline" | "failed";

/** Decides what to do about one chunk-load failure while trying to open `targetUrl`. */
export function recoverFromChunkError(targetUrl: string, deps: ChunkRecoveryDeps): ChunkRecoveryOutcome {
  if (!deps.isOnline()) {
    deps.notify("", "warning", "app.update.offline");
    return "offline";
  }

  const last = Number(safeGet(deps.storage, RELOAD_GUARD_KEY) ?? 0);
  if (last && deps.now() - last < RELOAD_GUARD_MS) {
    // Already reloaded once for this and it still fails — not a stale tab.
    safeRemove(deps.storage, RELOAD_GUARD_KEY);
    deps.notify("", "error", "app.update.loadFailed");
    return "failed";
  }

  if (!safeSet(deps.storage, RELOAD_GUARD_KEY, String(deps.now()))) {
    // No loop guard available (storage blocked) — never auto-reload blind.
    deps.notify("", "error", "app.update.loadFailed");
    return "failed";
  }
  deps.notify("", "info", "app.update.reloading", { countdownMs: RELOAD_DELAY_MS });
  deps.schedule(() => deps.reload(targetUrl), RELOAD_DELAY_MS);
  return "reloading";
}

/**
 * Wires recovery into the router (lazy route components — reloads straight
 * into the page the user was opening) and, as a fallback, into unhandled
 * promise rejections (lazy imports outside navigation — reloads the current
 * page). A navigation failure fires both; only the first one acts.
 */
export function installChunkRecovery(router: Router, deps: ChunkRecoveryDeps): void {
  let inFlight = false;
  let lastHandledAt = -Infinity;
  const recover = (targetUrl: string): void => {
    if (inFlight || deps.now() - lastHandledAt < DUPLICATE_WINDOW_MS) return;
    lastHandledAt = deps.now();
    inFlight = recoverFromChunkError(targetUrl, deps) === "reloading";
  };

  router.onError((err, to) => {
    if (!isChunkLoadError(err)) return;
    recover(router.resolve(to).href);
  });

  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
      if (!isChunkLoadError(event.reason)) return;
      recover(window.location.href);
    });
  }
}

export function browserChunkRecoveryDeps(
  notify: ChunkRecoveryDeps["notify"],
): ChunkRecoveryDeps {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return {
    notify,
    reload: (url) => window.location.assign(url),
    storage,
    isOnline: () => navigator.onLine,
    now: () => Date.now(),
    schedule: (fn, ms) => window.setTimeout(fn, ms),
  };
}

function safeGet(storage: ChunkRecoveryDeps["storage"], key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: ChunkRecoveryDeps["storage"], key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage: ChunkRecoveryDeps["storage"], key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage blocked — nothing to clear.
  }
}
