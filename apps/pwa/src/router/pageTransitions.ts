/**
 * Page-change motion (NEO-85, Łukasz picked "rekord A, moduły fade-through"
 * from the live proposal 2026-09-26):
 * - open:   list → one of its records. The record slides in from the right as
 *           a new sheet over the list, which dims and drifts left.
 * - back:   record → its list. The record slides back off to the right.
 * - module: anything else (menu / bottom nav). A quick M3 fade-through: the
 *           old page fades out and the new one fades in at 96% scale, since
 *           modules sit side by side and have no direction.
 *
 * Driven by the View Transitions API: the browser snapshots the old and the new
 * page and plays them over each other, so the record can slide over the list
 * without both views being mounted at once (page scroll stays on the window).
 * Only the content sheet has a view-transition-name (AppLayout), so the app
 * bar and side menu stay still. The keyframes live in assets/page-transitions.css,
 * keyed on <html data-page-transition="open|back|module">.
 *
 * Browsers without the API (and reduced-motion users, via CSS) keep what
 * AppLayout's own <Transition name="view-fade-lift"> does — see
 * `pageTransitionsSupported`.
 */
import { nextTick } from "vue";
import type { RouteLocationNormalized, Router } from "vue-router";
import { navParentName } from "./routes";

export type PageTransitionKind = "open" | "back" | "module";

/** How the user moved between two routes, judged by the list → record hierarchy. */
export function pageTransitionKind(from: RouteLocationNormalized, to: RouteLocationNormalized): PageTransitionKind {
  const fromName = typeof from.name === "string" ? from.name : undefined;
  const toName = typeof to.name === "string" ? to.name : undefined;
  if (fromName && toName && navParentName(toName) === fromName) return "open";
  if (fromName && toName && navParentName(fromName) === toName) return "back";
  return "module";
}

type StartViewTransition = (update: () => Promise<void>) => { finished: Promise<void> };

function startViewTransition(): StartViewTransition | undefined {
  if (typeof document === "undefined") return undefined;
  const fn = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  return typeof fn === "function" ? fn.bind(document) : undefined;
}

/** True when page changes are animated by View Transitions (AppLayout then drops its own fade). */
export function pageTransitionsSupported(): boolean {
  return startViewTransition() !== undefined;
}

/**
 * Both routes must be inside the signed-in app shell: the first screen after
 * login has its own entrance (AuthView → AppShell), and query-only changes
 * (search, filters, paging) are not page changes.
 */
function isInAppPageChange(from: RouteLocationNormalized, to: RouteLocationNormalized): boolean {
  // Routes are flat; App.vue picks the shell from meta.layout ("app" = AppLayout).
  if (from.meta.layout !== "app" || to.meta.layout !== "app") return false;
  return from.path !== to.path;
}

export function installPageTransitions(router: Router): void {
  const start = startViewTransition();
  if (!start) return;
  let finishUpdate: (() => void) | null = null;

  router.beforeResolve((to, from) => {
    if (!isInAppPageChange(from, to)) return true;
    const root = document.documentElement;
    root.dataset.pageTransition = pageTransitionKind(from, to);
    // Resolve the guard only once the browser has captured the old page, and
    // let the snapshot of the new page wait until the router has rendered it.
    return new Promise<boolean>((resolveGuard) => {
      const vt = start(
        () =>
          new Promise<void>((resolveUpdate) => {
            finishUpdate = resolveUpdate;
            resolveGuard(true);
          }),
      );
      vt.finished.finally(() => {
        if (root.dataset.pageTransition) delete root.dataset.pageTransition;
      });
    });
  });

  const release = async () => {
    const done = finishUpdate;
    finishUpdate = null;
    if (!done) return;
    await nextTick();
    done();
  };
  router.afterEach(() => void release());
  // A navigation cancelled after the old page was captured must not leave the
  // view transition waiting forever.
  router.onError(() => void release());
}
