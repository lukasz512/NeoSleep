/**
 * NEO-97 "row grows into the record" (variant C, Łukasz picked it from the live
 * prototype 2026-09-26), reworked in NEO-152 into "the drop" (picked from the
 * liquid prototype 2026-09-27): only the tapped row's avatar travels into the
 * record header — its circle stretches along the way like a drop of water and
 * settles with a small wobble — and travels back on Back. Its initials go out
 * to nothing first and come back in the header; the name no longer flies (its
 * box growing from 14 to 24 px read as the font scaling), it just fades in at
 * its full size. This module only tags elements with view-transition-names;
 * the motion lives in assets/page-transitions.css.
 *
 * The two ends are found through markers the shared components already carry:
 * - list row:      [data-page-hero-key="<record id>"] (AppEntityList, table
 *                  row and phone card), holding the first .app-avatar;
 * - record header: ItemDetailLayout's .view-item__record-header — its
 *                  .app-avatar, .view-item__record-title and the identity line
 *                  under it.
 * A view-transition-name must be unique on the page, so only one element per
 * name is tagged, and everything is untagged once the transition ends.
 */

export const HERO_NAMES = {
  avatar: "pwa-hero-avatar",
  initials: "pwa-hero-initials",
  title: "pwa-hero-title",
  details: "pwa-hero-details",
} as const;

/** CSS custom property (on <html>) with the flight's direction, for the drop's stretch. */
export const HERO_ANGLE_VAR = "--pwa-hero-angle";

const RECORD_HEADER = ".view-item__record-header";

export type HeroTags = {
  elements: HTMLElement[];
  /** Centre of the avatar tagged at the old end — kept across untagHero(). */
  origin?: { x: number; y: number };
};

function tag(tags: HeroTags, el: Element | null, name: string): boolean {
  if (!(el instanceof HTMLElement)) return false;
  el.style.viewTransitionName = name;
  tags.elements.push(el);
  return true;
}

/** The angle, in degrees, of the line from one point to another (0 = to the right, 90 = down). */
export function heroAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/**
 * Tags an avatar (its circle and, separately, its initials, so the letters
 * can fade out and in on their own) and records where it is: the first call
 * of a transition remembers the old end, the second sets the flight's angle.
 */
function tagAvatar(tags: HeroTags, avatar: Element | null): boolean {
  if (!tag(tags, avatar, HERO_NAMES.avatar)) return false;
  tag(tags, avatar!.querySelector(".app-avatar__initials"), HERO_NAMES.initials);
  const box = avatar!.getBoundingClientRect();
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  if (!tags.origin) tags.origin = centre;
  else document.documentElement.style.setProperty(HERO_ANGLE_VAR, `${heroAngle(tags.origin, centre)}deg`);
  return true;
}

/** Forgets the old end and the angle — call when a transition starts and when it ends. */
export function resetHero(tags: HeroTags): void {
  untagHero(tags);
  tags.origin = undefined;
  document.documentElement.style.removeProperty(HERO_ANGLE_VAR);
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

/** Tags the row's avatar. False when the row (or its avatar) isn't on screen. */
export function tagHeroRow(root: ParentNode, id: string, tags: HeroTags): boolean {
  const row = findHeroRow(root, id);
  if (!row) return false;
  return tagAvatar(tags, row.querySelector(".app-avatar"));
}

/** True once the record header shows the loaded record (not its skeleton). */
export function recordHeaderReady(root: ParentNode): boolean {
  return root.querySelector(`${RECORD_HEADER} .view-item__record-title`) !== null;
}

/** Tags the record header's avatar, and its name and identity line (which only fade). */
export function tagHeroRecord(root: ParentNode, tags: HeroTags): boolean {
  const header = root.querySelector(RECORD_HEADER);
  if (!header) return false;
  const avatar = tagAvatar(tags, header.querySelector(".app-avatar"));
  tag(tags, header.querySelector(".view-item__record-title"), HERO_NAMES.title);
  tag(tags, header.querySelector(".view-item__record-details"), HERO_NAMES.details);
  return avatar;
}

export function untagHero(tags: HeroTags): void {
  for (const el of tags.elements) el.style.viewTransitionName = "";
  tags.elements.length = 0;
}

/**
 * Resolves once `ready()` holds, or after `timeoutMs` — the record is fetched
 * after navigation, so the header may still be a skeleton on the first render.
 * While this waits the browser keeps showing the old page frozen, so the cap
 * is kept short (NEO-152: 120 ms, was 450). Polls on a timer, not
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
