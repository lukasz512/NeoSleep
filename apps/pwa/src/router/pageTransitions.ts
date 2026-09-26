/**
 * Page-change motion (NEO-85; open/back reworked in NEO-97, Łukasz picked
 * variant C "row grows into the record" from the live prototype 2026-09-26):
 * - open:   list → one of its records. The tapped row's avatar and name fly
 *           into the record header while the rest of the record rises in.
 * - back:   record → its list. The avatar and name fly back into their row.
 * - module: anything else (menu / bottom nav). A quick M3 fade-through, since
 *           modules sit side by side and have no direction.
 *
 * Driven by the View Transitions API: the browser snapshots the old and the new
 * page and plays them over each other, without both views being mounted at
 * once (page scroll stays on the window). The content sheet has a
 * view-transition-name (AppLayout), so the app bar and side menu stay still;
 * the flying avatar/name get theirs from pageTransitionHero.ts for the length
 * of one transition. The keyframes live in assets/page-transitions.css, keyed
 * on <html data-page-transition="open|back|module">.
 *
 * Browsers without the API (and reduced-motion users, via CSS) keep what
 * AppLayout's own <Transition name="view-fade-lift"> does — see
 * `pageTransitionsSupported`.
 */
import { nextTick } from "vue";
import type { RouteLocationNormalized, Router } from "vue-router";
import { navParentName } from "./routes";
import { findHeroRow, recordHeaderReady, tagHeroRecord, tagHeroRow, untagHero, waitFor, type HeroTags } from "./pageTransitionHero";

/** Longest the new page's snapshot waits for the other end of the hero to render (NEO-97). */
const HERO_WAIT_MS = 450;

/** The record's id: its route's single param (/patients/:id, /hcp/:id, …). */
function recordId(loc: RouteLocationNormalized): string | undefined {
  const value = Object.values(loc.params)[0];
  return typeof value === "string" && value ? value : undefined;
}

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
  // NEO-97: tags the other end of the hero (record header on open, list row on
  // back) on the new page just before its snapshot; null when this move has none.
  let tagNewEnd: (() => Promise<void>) | null = null;
  const tags: HeroTags = { elements: [] };

  router.beforeResolve((to, from) => {
    if (!isInAppPageChange(from, to)) return true;
    const root = document.documentElement;
    const kind = pageTransitionKind(from, to);
    root.dataset.pageTransition = kind;
    untagHero(tags);
    tagNewEnd = null;
    const main = document.querySelector("main") ?? document.body;
    const id = kind === "open" ? recordId(to) : kind === "back" ? recordId(from) : undefined;
    if (id && kind === "open" && tagHeroRow(main, id, tags)) {
      tagNewEnd = async () => {
        if (await waitFor(() => recordHeaderReady(main), HERO_WAIT_MS)) tagHeroRecord(main, tags);
      };
    } else if (id && kind === "back" && tagHeroRecord(main, tags)) {
      tagNewEnd = async () => {
        if (await waitFor(() => findHeroRow(main, id) !== null, HERO_WAIT_MS)) tagHeroRow(main, id, tags);
      };
    }
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
        untagHero(tags);
      });
    });
  });

  const release = async () => {
    const done = finishUpdate;
    finishUpdate = null;
    if (!done) return;
    await nextTick();
    const tagEnd = tagNewEnd;
    tagNewEnd = null;
    if (tagEnd) {
      // The old end was captured with the old page; untag it before tagging
      // the new end so no name sits on two elements.
      untagHero(tags);
      await tagEnd();
    }
    done();
  };
  router.afterEach(() => void release());
  // A navigation cancelled after the old page was captured must not leave the
  // view transition waiting forever.
  router.onError(() => void release());
}
