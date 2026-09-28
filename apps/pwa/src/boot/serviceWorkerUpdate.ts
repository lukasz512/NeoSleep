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
 *  - nobody has touched the page yet (no tap, click or key since it loaded)
 *    → reload right away. That's the "just opened the app / the QR link
 *    after a deploy" case. Not a fixed time window: on pwa-dev the new
 *    worker needed ~22 s to download a real deploy, past the 15 s window
 *    the first version used, so the page stayed on the old build.
 *  - touched → never yank the page mid-form: the next route change becomes a
 *    full page load of that route instead (unsaved-changes guards have
 *    already run by then). chunkRecovery.ts still covers a lazy chunk that
 *    vanished in between.
 */

/** What counts as "someone is using this page" — scrolling alone does not. */
export const INTERACTION_EVENTS = ["pointerdown", "keydown", "input"] as const;
/** A reload inside this window already happened — don't loop if the new worker keeps reactivating. */
export const RELOAD_GUARD_KEY = "neo:sw-reload-at";
export const RELOAD_GUARD_MS = 30_000;

export type UpdateAction = "reload-now" | "reload-on-next-navigation" | "none";

export function decideUpdateAction(interacted: boolean, lastReloadAt: number | null, now: number): UpdateAction {
  if (lastReloadAt !== null && now - lastReloadAt < RELOAD_GUARD_MS) return "none";
  return interacted ? "reload-on-next-navigation" : "reload-now";
}

export interface ServiceWorkerUpdateDeps {
  now: () => number;
  /** True once the user has tapped, clicked or typed on this page. */
  hasInteracted: () => boolean;
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
    const action = decideUpdateAction(deps.hasInteracted(), deps.readGuard(), now);
    if (action === "reload-now") {
      deps.writeGuard(now);
      deps.reload();
    } else if (action === "reload-on-next-navigation") {
      pending = true;
    }
  };
}

export function browserDeps(): ServiceWorkerUpdateDeps {
  let interacted = false;
  const mark = () => {
    interacted = true;
    for (const type of INTERACTION_EVENTS) window.removeEventListener(type, mark, true);
  };
  for (const type of INTERACTION_EVENTS) window.addEventListener(type, mark, { capture: true, passive: true });
  return {
    now: () => Date.now(),
    hasInteracted: () => interacted,
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
