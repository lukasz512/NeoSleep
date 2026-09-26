/**
 * NEO-97 "row grows into the record" (variant C, Łukasz picked it from the live
 * prototype 2026-09-26): the tapped row's avatar and name fly into the record
 * header, and fly back into their row on Back. This module only tags elements
 * with view-transition-names; the motion lives in assets/page-transitions.css.
 *
 * The two ends are found through markers the shared components already carry:
 * - list row:      [data-page-hero-key="<record id>"] (AppEntityList, table
 *                  row and phone card), holding the first .app-avatar and the
 *                  first [data-page-hero-name] (EntityLink's label, the phone
 *                  card's title);
 * - record header: ItemDetailLayout's .view-item__record-header — its
 *                  .app-avatar, .view-item__record-title and the identity line
 *                  under it.
 * A view-transition-name must be unique on the page, so only one element per
 * name is tagged, and everything is untagged once the transition ends.
 */

export const HERO_NAMES = {
  avatar: "pwa-hero-avatar",
  name: "pwa-hero-name",
  details: "pwa-hero-details",
} as const;

const RECORD_HEADER = ".view-item__record-header";

export type HeroTags = { elements: HTMLElement[] };

function tag(tags: HeroTags, el: Element | null, name: string): boolean {
  if (!(el instanceof HTMLElement)) return false;
  el.style.viewTransitionName = name;
  tags.elements.push(el);
  return true;
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

/** The visible list row (table row or phone card) for a record id. */
export function findHeroRow(root: ParentNode, id: string): HTMLElement | null {
  const rows = root.querySelectorAll<HTMLElement>(`[data-page-hero-key="${cssEscape(id)}"]`);
  // The table and the phone feed are both in the DOM (one v-show'n away).
  for (const row of rows) if (row.offsetParent !== null || row.getClientRects().length > 0) return row;
  return null;
}

/** Tags the row's avatar + name. False when the row isn't on screen. */
export function tagHeroRow(root: ParentNode, id: string, tags: HeroTags): boolean {
  const row = findHeroRow(root, id);
  if (!row) return false;
  const avatar = tag(tags, row.querySelector(".app-avatar"), HERO_NAMES.avatar);
  const name = tag(tags, row.querySelector("[data-page-hero-name]"), HERO_NAMES.name);
  return avatar || name;
}

/** True once the record header shows the loaded record (not its skeleton). */
export function recordHeaderReady(root: ParentNode): boolean {
  return root.querySelector(`${RECORD_HEADER} .view-item__record-title`) !== null;
}

/** Tags the record header's avatar, name and identity line. */
export function tagHeroRecord(root: ParentNode, tags: HeroTags): boolean {
  const header = root.querySelector(RECORD_HEADER);
  if (!header) return false;
  const avatar = tag(tags, header.querySelector(".app-avatar"), HERO_NAMES.avatar);
  const name = tag(tags, header.querySelector(".view-item__record-title"), HERO_NAMES.name);
  tag(tags, header.querySelector(".view-item__record-details"), HERO_NAMES.details);
  return avatar || name;
}

export function untagHero(tags: HeroTags): void {
  for (const el of tags.elements) el.style.viewTransitionName = "";
  tags.elements.length = 0;
}

/**
 * Resolves once `ready()` holds, or after `timeoutMs` — the record is fetched
 * after navigation, so the header may still be a skeleton on the first render.
 * While this waits the browser keeps showing the old page (with the tapped
 * row's pressed state), so the cap is kept short. Polls on a timer, not
 * requestAnimationFrame: the browser pauses rendering (and rAF) while a view
 * transition waits for its update, so an rAF loop would never tick.
 */
export function waitFor(ready: () => boolean, timeoutMs: number): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (ready()) return resolve(true);
      if (performance.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, 16);
    };
    setTimeout(tick, 16);
  });
}
