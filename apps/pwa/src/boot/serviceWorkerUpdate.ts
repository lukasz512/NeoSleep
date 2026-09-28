import type { Router } from "vue-router";

/**
 * Getting onto a new deploy without a manual refresh (NEO-125).
 *
 * The service worker precaches the build, so the first open after a deploy
 * is served the previous version from cache; the new worker downloads in the
 * background and takes over (autoUpdate = skipWaiting). Before this module
 * nothing reloaded the page, so people kept seeing the old version until
 * their next visit.
 *
 * When the new worker takes control:
 *  - within BOOT_WINDOW_MS of page load → reload right away. That's the
 *    "just opened the app / the QR link after a deploy" case, and nobody has
 *    typed anything yet.
 *  - later → never yank the page mid-form: the next route change becomes a
 *    full page load of that route instead (unsaved-changes guards have
 *    already run by then). chunkRecovery.ts still covers a lazy chunk that
 *    vanished in between.
 */

export const BOOT_WINDOW_MS = 15_000;
/** A reload inside this window already happened — don't loop if the new worker keeps reactivating. */
export const RELOAD_GUARD_KEY = "neo:sw-reload-at";
export const RELOAD_GUARD_MS = 30_000;

export type UpdateAction = "reload-now" | "reload-on-next-navigation" | "none";

export function decideUpdateAction(msSinceBoot: number, lastReloadAt: number | null, now: number): UpdateAction {
  if (lastReloadAt !== null && now - lastReloadAt < RELOAD_GUARD_MS) return "none";
  return msSinceBoot <= BOOT_WINDOW_MS ? "reload-now" : "reload-on-next-navigation";
}

export interface ServiceWorkerUpdateDeps {
  now: () => number;
  bootAt: number;
  readGuard: () => number | null;
  writeGuard: (at: number) => void;
  reload: () => void;
  /** Full page load of a URL (the route the user just navigated to). */
  loadUrl: (url: string) => void;
}

/** Returns the onNeedReload handler for registerSW; wires the deferred reload into the router. */
export function createNeedReloadHandler(router: Pick<Router, "afterEach" | "resolve">, deps: ServiceWorkerUpdateDeps): () => void {
  let pending = false;
  router.afterEach((to, from, failure) => {
    if (!pending || failure || to.fullPath === from.fullPath) return;
    pending = false;
    deps.writeGuard(deps.now());
    deps.loadUrl(router.resolve(to.fullPath).href);
  });
  return () => {
    const now = deps.now();
    const action = decideUpdateAction(now - deps.bootAt, deps.readGuard(), now);
    if (action === "reload-now") {
      deps.writeGuard(now);
      deps.reload();
    } else if (action === "reload-on-next-navigation") {
      pending = true;
    }
  };
}

export function browserDeps(bootAt: number): ServiceWorkerUpdateDeps {
  return {
    now: () => Date.now(),
    bootAt,
    readGuard: () => {
      try {
        const v = sessionStorage.getItem(RELOAD_GUARD_KEY);
        return v ? Number(v) : null;
      } catch {
        // benign: storage blocked (private mode) — no guard, worst case one extra reload
        return null;
      }
    },
    writeGuard: (at) => {
      try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(at));
      } catch {
        // benign: storage blocked (private mode) — the guard is best-effort
      }
    },
    reload: () => window.location.reload(),
    loadUrl: (url) => window.location.assign(url),
  };
}
