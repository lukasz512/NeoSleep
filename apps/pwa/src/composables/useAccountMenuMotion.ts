/**
 * Motion for the account menu, NEO-154 variant A "Kropla" (Łukasz picked it
 * from the live prototype, 2026-09-27). The avatar is a nail: it never moves,
 * it only grows from the app bar size to the menu size around its own centre,
 * while the card surface pours out of it like water (a blob behind a gooey
 * threshold filter), overshoots a little and settles. The name and role blur
 * out of the button and sharpen in the card header. Desktop and phone share
 * all of it; on the phone the card spans the screen from the top edge.
 *
 * On the phone the avatar moves like a drop of water instead (NEO-154 follow-up):
 * it swells under the finger, dips, swells to 120% and settles at 110%.
 *
 * Everything here is Web Animations API on plain elements, so the component
 * decides *when* and this file only decides *how*. With prefers-reduced-motion
 * (or no WAAPI, e.g. jsdom) every function resolves immediately and the menu
 * simply appears/disappears.
 */

/** Material 3 "emphasized decelerate" — fast start, very soft landing. */
const EMPHASIZED = "cubic-bezier(0.05, 0.7, 0.1, 1)";
/** Material 3 "emphasized accelerate" — for exits. */
const ACCELERATE = "cubic-bezier(0.3, 0, 0.8, 0.15)";
const STANDARD = "cubic-bezier(0.2, 0, 0, 1)";
/** Symmetric ease for the page dim: no visible start or stop. */
const DIM_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
/** One swing of the water drop: eases in and out of each turning point. */
const SWING = "cubic-bezier(0.37, 0, 0.23, 1)";
/** Page dim behind the card (phone dims more: the card covers most of the screen). */
export const DESKTOP_DIM_OPACITY = 0.06;
export const PHONE_DIM_OPACITY = 0.38;
/** Desktop: the header avatar is this much bigger than the app bar one (40 / 32). */
export const AVATAR_GROWTH = 40 / 32;
/** Phone: the open avatar rests at 110% of the app bar one. */
export const PHONE_AVATAR_GROWTH = 1.1;
/** Phone: how far the app bar avatar swells under the finger. */
export const PHONE_PRESS_SCALE = 1.12;
/** Phone: the peak of the drop before it settles at PHONE_AVATAR_GROWTH. */
export const PHONE_AVATAR_PEAK = 1.2;

/** How much bigger the menu's avatar is than the app bar's. */
export function avatarGrowth(phone: boolean): number {
  return phone ? PHONE_AVATAR_GROWTH : AVATAR_GROWTH;
}
/** Desktop: gap between the card edge and the header avatar (top and end). */
const AVATAR_INSET = 4;
/** Desktop card border width — the header padding sits inside it. */
const CARD_BORDER = 1;

export function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof Element.prototype.animate !== "function") return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A damped spring sampled into a CSS `linear()` easing (zeta < 1 overshoots),
 * or `fallback` where the browser has no `linear()`.
 */
export function springEasing(zeta: number, fallback: string): string {
  if (typeof CSS === "undefined" || !CSS.supports?.("transition-timing-function", "linear(0, 1)")) return fallback;
  const w = 6.9 / zeta; // settles to 0.1% by t = 1
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const points: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
    points.push(i === 60 ? 1 : Math.round(x * 10000) / 10000);
  }
  return `linear(${points.join(", ")})`;
}

/** Resolves when the animation ends, whether it finished or was cancelled. */
function ended(a: Animation): Promise<unknown> {
  // benign: finished rejects with AbortError on cancel() (a new open/close took over)
  return a.finished.catch(() => undefined);
}
const settled = (list: Animation[]) => Promise.all(list.map(ended));

export interface CardParts {
  /** The avatar inside the trigger button — the nail everything turns around. */
  triggerAvatar: Element;
  /** Name / role text inside the trigger button (desktop shows them, phone doesn't). */
  triggerName: Element | null;
  triggerRole: Element | null;
  /** Fixed-position card that wraps the menu panel and paints its surface. */
  card: HTMLElement;
  shadow: HTMLElement;
  dim: HTMLElement;
  /** Fixed layer behind the card, filtered so its shapes merge like liquid. */
  liquid: HTMLElement;
  /** The card surface while it pours out of the avatar. */
  blob: HTMLElement;
  /** A drop that trails from the avatar into the blob, so the two stay joined. */
  drop: HTMLElement;
  avatar: Element;
  name: Element | null;
  role: Element | null;
  /** Header bits with no counterpart in the button (email, region chip). */
  extras: Element[];
  /** Everything under the header, animated one after another. */
  rows: Element[];
  /** Phone: full-width card from the top edge; desktop: 340px card. */
  phone: boolean;
  /** Scale the app bar avatar had when the menu started opening (phone press). */
  pressScale?: number;
}

/**
 * Positions the fixed card so its header avatar's centre sits exactly on the
 * trigger avatar's centre, and sizes the shadow to it. Desktop: the avatar
 * keeps a fixed inset from the card's top and end edge, so the card follows
 * the avatar. Phone: the card is pinned to the top edge and the header padding
 * (--account-menu-avatar-top / -end) follows the avatar instead.
 */
export function placeCard(parts: Pick<CardParts, "triggerAvatar" | "card" | "shadow" | "phone">): void {
  const { triggerAvatar, card, shadow, phone } = parts;
  const a = triggerAvatar.getBoundingClientRect();
  const half = (a.height * avatarGrowth(phone)) / 2;
  const top = a.top + a.height / 2 - half;
  const end = document.documentElement.clientWidth - (a.left + a.width / 2 + half);
  if (phone) {
    Object.assign(card.style, { top: "0px", left: "0px", right: "0px" });
    card.style.setProperty("--account-menu-avatar-top", `${Math.max(0, top)}px`);
    card.style.setProperty("--account-menu-avatar-end", `${Math.max(0, end)}px`);
  } else {
    Object.assign(card.style, { top: `${top - AVATAR_INSET}px`, right: `${end - AVATAR_INSET}px`, left: "" });
    card.style.setProperty("--account-menu-avatar-top", `${AVATAR_INSET - CARD_BORDER}px`);
    card.style.setProperty("--account-menu-avatar-end", `${AVATAR_INSET - CARD_BORDER}px`);
  }
  const c = card.getBoundingClientRect();
  Object.assign(shadow.style, { top: `${c.top}px`, left: `${c.left}px`, width: `${c.width}px`, height: `${c.height}px` });
}

type Box = { left: number; top: number; width: number; height: number };
const px = (b: Box, radius: number | string): Keyframe => ({
  left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`,
  borderRadius: typeof radius === "number" ? `${radius}px` : radius,
});

/** Room around the liquid layer for the blur to spread into. */
const LIQUID_BLEED = 24;

/**
 * The shapes the liquid passes through: the avatar dot, a stretched drop, the
 * card. The liquid layer is sized to just the card (plus bleed) rather than
 * the whole viewport, so the gooey filter blurs a card-sized area per frame —
 * the full-screen layer was what made the motion stutter on phones.
 */
function liquidShapes(parts: CardParts) {
  const av = parts.triggerAvatar.getBoundingClientRect();
  const cr = parts.card.getBoundingClientRect();
  const ox = Math.min(av.left, cr.left) - LIQUID_BLEED;
  const oy = Math.min(av.top, cr.top) - LIQUID_BLEED;
  const right = Math.max(av.right, cr.right) + LIQUID_BLEED;
  const bottom = Math.max(av.bottom, cr.bottom) + LIQUID_BLEED;
  Object.assign(parts.liquid.style, { left: `${ox}px`, top: `${oy}px`, width: `${right - ox}px`, height: `${bottom - oy}px` });
  const a = { left: av.left - ox, top: av.top - oy, width: av.width, height: av.height };
  const c = { left: cr.left - ox, top: cr.top - oy, width: cr.width, height: cr.height };
  const cx = a.left + a.width / 2;
  const cy = a.top + a.height / 2;
  const r = a.width / 2;
  // the card's own corners (all round on desktop, bottom only on the phone)
  const radius = getComputedStyle(parts.card).borderRadius || "24px";
  return {
    dot: { left: cx - r, top: cy - r, width: 2 * r, height: 2 * r },
    // height leads, width follows: the surface runs down before it spreads
    stretched: { left: c.left + c.width * 0.5, top: c.top, width: c.width * 0.5, height: c.height * 0.72 },
    card: { left: c.left, top: c.top, width: c.width, height: c.height },
    // where the trailing drop sinks into the surface
    sink: { left: c.left + c.width * 0.55, top: c.top + c.height * 0.4, width: 8, height: 8 },
    lift: { left: cx - r - 6, top: cy - r - 6, width: 2 * r + 12, height: 2 * r + 12 },
    r,
    radius,
  };
}

const FLUID = springEasing(0.74, EMPHASIZED);
const POP = springEasing(0.62, EMPHASIZED);
const PRESS = springEasing(0.6, EMPHASIZED);

/** Phone: the app bar avatar swells under the finger like a drop about to fall. */
export function pressAvatar(avatar: Element): Animation | null {
  if (!motionAllowed()) return null;
  return avatar.animate([{ transform: "none" }, { transform: `scale(${PHONE_PRESS_SCALE})` }], { duration: 260, easing: PRESS, fill: "forwards" });
}

/** Phone: the finger left without opening the menu — the drop settles back. */
export function releaseAvatar(avatar: Element, press: Animation | null): void {
  if (!press || !motionAllowed()) return press?.cancel();
  const back = avatar.animate([{ transform: `scale(${PHONE_PRESS_SCALE})` }, { transform: "none" }], { duration: 320, easing: PRESS });
  press.cancel();
  void ended(back);
}

/**
 * Phone: the drop's path, as scales of the app bar avatar — from the press it
 * dips (a little wider than tall, like water pulled back), swells to its peak
 * (a little taller than wide) and settles at the resting size.
 */
function waterDrop(from: number): Keyframe[] {
  const g = PHONE_AVATAR_GROWTH;
  const at = (sx: number, sy: number, offset: number): Keyframe => ({ transform: `scale(${sx / g}, ${sy / g})`, offset, easing: SWING });
  return [
    at(from, from, 0),
    at(0.95, 0.9, 0.26),
    at(PHONE_AVATAR_PEAK * 0.98, PHONE_AVATAR_PEAK, 0.58),
    at(1.07, 1.075, 0.82),
    { transform: "none", offset: 1 },
  ];
}

/** Desktop and phone open, ~0.62 s. `reveal` runs once the card has settled. */
export async function openCard(parts: CardParts, reveal: () => void): Promise<void> {
  const { card, shadow, dim, liquid, blob, drop, avatar, name, role, extras, rows, triggerName, triggerRole } = parts;
  const dimTo = String(parts.phone ? PHONE_DIM_OPACITY : DESKTOP_DIM_OPACITY);
  if (!motionAllowed()) {
    reveal();
    dim.style.opacity = dimTo;
    shadow.style.opacity = "1";
    return;
  }
  const s = liquidShapes(parts);
  card.classList.add("account-menu__card--fluid");
  liquid.style.visibility = "visible";
  // the menu's avatar takes over at once, so the pressed bar avatar can't peek out behind the dip
  const barAvatar = parts.triggerAvatar as HTMLElement;
  if (parts.phone) barAvatar.style.visibility = "hidden";
  const anims: Animation[] = [
    // 1. the surface pours out of the avatar, runs down, spreads and settles
    blob.animate([px(s.dot, s.r), { ...px(s.stretched, 30), offset: 0.38 }, px(s.card, s.radius)], { duration: 620, easing: FLUID, fill: "both" }),
    drop.animate([px(s.lift, s.r + 6), px(s.sink, 4)], { duration: 460, easing: EMPHASIZED, fill: "both" }),
    // 2. the nail: the avatar only grows, around its own centre (on the phone
    //    as a drop of water, from wherever the press left it)
    parts.phone
      ? avatar.animate(waterDrop(parts.pressScale ?? 1), { duration: 720 })
      : avatar.animate([{ transform: `scale(${1 / AVATAR_GROWTH})` }, { transform: "none" }], { duration: 520, easing: POP }),
    // 3. the header text sharpens in, the rows follow one by one
    ...[name, role, ...extras].filter((el): el is Element => el !== null).map((el, i) =>
      el.animate([{ opacity: 0, filter: "blur(5px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 300, delay: 150 + i * 40, easing: EMPHASIZED, fill: "backwards" })),
    ...rows.map((el, i) =>
      el.animate(
        // transform + opacity only: stays on the compositor, no per-row blur pass
        [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
        { duration: 320, delay: 190 + i * 45, easing: EMPHASIZED, fill: "backwards" })),
    ...[triggerName, triggerRole].filter((el): el is Element => el !== null).map((el) =>
      el.animate([{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(5px)" }], { duration: 200, easing: STANDARD, fill: "forwards" })),
    dim.animate([{ opacity: 0 }, { opacity: dimTo }], { duration: 420, easing: DIM_EASE, fill: "forwards" }),
    // 4. the card lifts off once it has landed
    shadow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 420, easing: STANDARD, fill: "forwards" }),
  ];
  await settled(anims);
  reveal();
  barAvatar.style.visibility = "";
  card.classList.remove("account-menu__card--fluid");
  liquid.style.visibility = "";
  shadow.style.opacity = "1";
  dim.style.opacity = dimTo;
  anims.forEach((a) => a.cancel());
}

/**
 * Close, ~0.42 s: the content fades while the surface is already draining
 * back into the avatar (the two overlap, so there is no pause between them),
 * the avatar shrinks to the bar size and the page dim lifts over the whole
 * close. `reveal` shows the button again (its name blurs back in) as the
 * liquid starts to drain. A card dragged up on the phone drains from where
 * the finger left it and slides home on the way.
 */
export async function closeCard(parts: CardParts, reveal: () => void): Promise<void> {
  const { card, shadow, dim, liquid, blob, drop, avatar, name, role, extras, rows, triggerName, triggerRole } = parts;
  if (!motionAllowed()) {
    reveal();
    return;
  }
  const dimFrom = getComputedStyle(dim).opacity || String(parts.phone ? PHONE_DIM_OPACITY : DESKTOP_DIM_OPACITY);
  const growth = avatarGrowth(parts.phone);
  const dragged = card.style.transform;
  const fade: Animation[] = [
    ...rows.map((el) => el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-4px)" }], { duration: 120, easing: ACCELERATE, fill: "forwards" })),
    ...[name, role, ...extras].filter((el): el is Element => el !== null).map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0, filter: "blur(4px)" }], { duration: 140, fill: "forwards" })),
    shadow.animate([{ opacity: getComputedStyle(shadow).opacity || 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }),
    dim.animate([{ opacity: dimFrom }, { opacity: 0 }], { duration: 420, easing: DIM_EASE, fill: "forwards" }),
  ];
  await new Promise((r) => setTimeout(r, 80));
  const s = liquidShapes(parts);
  card.classList.add("account-menu__card--fluid");
  liquid.style.visibility = "visible";
  reveal();
  const drain: Animation[] = [
    blob.animate([px(s.card, s.radius), { ...px(s.stretched, 30), offset: 0.55 }, px(s.dot, s.r)], { duration: 320, easing: ACCELERATE, fill: "forwards" }),
    drop.animate([px(s.sink, 4), px(s.lift, s.r + 6)], { duration: 320, easing: STANDARD, fill: "forwards" }),
    avatar.animate([{ transform: "none" }, { transform: `scale(${1 / growth})` }], { duration: 300, easing: STANDARD, fill: "forwards" }),
    ...(dragged ? [card.animate([{ transform: dragged }, { transform: "none" }], { duration: 300, easing: STANDARD, fill: "forwards" })] : []),
  ];
  const text = [triggerName, triggerRole].filter((el): el is Element => el !== null).map((el) =>
    el.animate([{ opacity: 0, filter: "blur(5px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 220, delay: 160, easing: EMPHASIZED, fill: "both" }));
  await settled([...fade, ...drain, ...text]);
  // The overlay unmounts next, so only the button's own text needs its styles back.
  for (const a of text) a.cancel();
}
