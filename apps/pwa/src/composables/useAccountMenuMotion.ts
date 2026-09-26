/**
 * Motion for the account menu (NEO-122): the avatar button turns into the menu.
 *
 * Desktop — the card opens in place of the button, its header avatar exactly on
 * the button's avatar: a soft-edged bloom out of the avatar (mask radius, the
 * `--r` custom property), name and role travel from the button into the header,
 * rows arrive one by one and sharpen, shadow and a light page dim come in last.
 * Phone — a bottom sheet rises while the avatar flies in an arc from the app bar
 * into the sheet header.
 *
 * Everything here is Web Animations API on plain elements, so the component
 * decides *when* and this file only decides *how*. With prefers-reduced-motion
 * (or no WAAPI, e.g. jsdom) every function resolves immediately and the menu
 * simply appears/disappears. Timings and easings match the approved prototype.
 */

/** Material 3 "emphasized decelerate" — fast start, very soft landing. */
const EMPHASIZED = "cubic-bezier(0.05, 0.7, 0.1, 1)";
/** Material 3 "emphasized accelerate" — for exits. */
const ACCELERATE = "cubic-bezier(0.3, 0, 0.8, 0.15)";
const STANDARD = "cubic-bezier(0.2, 0, 0, 1)";
/** Page dim while the desktop card is open. */
export const DESKTOP_DIM_OPACITY = 0.06;
/** Scrim behind the phone sheet. */
export const SHEET_SCRIM_OPACITY = 0.38;

export function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof Element.prototype.animate !== "function") return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Resolves when the animation ends, whether it finished or was cancelled. */
function ended(a: Animation): Promise<unknown> {
  // benign: finished rejects with AbortError on cancel() (a new open/close took over)
  return a.finished.catch(() => undefined);
}
const settled = (list: Animation[]) => Promise.all(list.map(ended));

/** Transform that puts `to` where `from` is (FLIP "invert" step), scaled by height. */
function invert(from: Element, to: Element): string {
  const f = from.getBoundingClientRect();
  const t = to.getBoundingClientRect();
  if (!t.height) return "none";
  return `translate(${f.left - t.left}px, ${f.top - t.top}px) scale(${f.height / t.height})`;
}

export interface CardParts {
  /** The avatar inside the trigger button. */
  triggerAvatar: Element;
  /** Name / role text inside the trigger button (desktop shows them, phone doesn't). */
  triggerName: Element | null;
  triggerRole: Element | null;
  /** Fixed-position wrapper of the menu panel; it carries the mask. */
  card: HTMLElement;
  shadow: HTMLElement;
  dim: HTMLElement;
  avatar: Element;
  name: Element | null;
  role: Element | null;
  /** Header bits with no counterpart in the button (email, region chip). */
  extras: Element[];
  /** Everything under the header, animated one after another. */
  rows: Element[];
}

/**
 * Positions the fixed card so its header avatar's centre sits on the trigger
 * avatar's centre, sizes the shadow to it, and aims the bloom at the avatar.
 */
export function placeCard(parts: Pick<CardParts, "triggerAvatar" | "card" | "shadow" | "avatar">): void {
  const { triggerAvatar, card, shadow, avatar } = parts;
  card.style.top = "0px";
  card.style.right = "0px";
  const a = triggerAvatar.getBoundingClientRect();
  const b = avatar.getBoundingClientRect();
  card.style.top = `${Math.max(4, a.top + a.height / 2 - (b.top + b.height / 2))}px`;
  card.style.right = `${b.left + b.width / 2 - (a.left + a.width / 2)}px`;
  const c = card.getBoundingClientRect();
  Object.assign(shadow.style, { top: `${c.top}px`, left: `${c.left}px`, width: `${c.width}px`, height: `${c.height}px` });
  const av = avatar.getBoundingClientRect();
  card.style.setProperty("--bloom-x", `${av.left - c.left + av.width / 2}px`);
  card.style.setProperty("--bloom-y", `${av.top - c.top + av.height / 2}px`);
}

/** Soft edge width of the bloom (matches the `- 36px` in the card's mask). */
const BLOOM_EDGE = 36;

function bloomRadius(card: HTMLElement): number {
  const c = card.getBoundingClientRect();
  return Math.hypot(c.width, c.height) + 40;
}

/** Radius that already covers the whole button, so the name and role never
 *  blink out while they travel into the header. */
function buttonRadius(trigger: Element, avatar: Element): number {
  const t = trigger.getBoundingClientRect();
  const a = avatar.getBoundingClientRect();
  const cx = a.left + a.width / 2;
  const cy = a.top + a.height / 2;
  const far = Math.max(Math.hypot(cx - t.left, cy - t.top), Math.hypot(cx - t.left, t.bottom - cy));
  return far + BLOOM_EDGE;
}

/** Desktop open, ~0.6 s. `beforeReveal` runs after the button's press, right before the card shows. */
export async function openCard(parts: CardParts, trigger: HTMLElement, beforeReveal: () => void): Promise<void> {
  if (!motionAllowed()) {
    beforeReveal();
    parts.dim.style.opacity = String(DESKTOP_DIM_OPACITY);
    parts.shadow.style.opacity = "1";
    return;
  }
  // 1. the button gives a little under the click
  await ended(trigger.animate([{ transform: "scale(1)" }, { transform: "scale(.965)" }], { duration: 90, easing: STANDARD }));
  beforeReveal();
  const { card, shadow, dim, avatar, name, role, extras, rows, triggerName, triggerRole } = parts;
  const anims: Animation[] = [
    // 2. soft-edged bloom out of the avatar
    card.animate([{ "--r": `${buttonRadius(trigger, avatar)}px` }, { "--r": `${bloomRadius(card)}px` }], { duration: 520, easing: STANDARD }),
    // the avatar turns from a circle into the panel's rounded square
    avatar.animate([{ borderRadius: "999px", transform: "scale(.9)" }, { borderRadius: "12px", transform: "none" }], { duration: 380, easing: EMPHASIZED }),
    ...extras.map((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: 60 + i * 60, easing: EMPHASIZED, fill: "backwards" })),
    // 4. rows arrive one after another and sharpen
    ...rows.map((el, i) =>
      el.animate(
        [{ opacity: 0, transform: "translateY(10px)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
        { duration: 300, delay: 50 + i * 35, easing: EMPHASIZED, fill: "backwards" })),
    // 5. the card lifts off the bar
    shadow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 160, easing: STANDARD, fill: "forwards" }),
    dim.animate([{ opacity: 0 }, { opacity: DESKTOP_DIM_OPACITY }], { duration: 300, easing: STANDARD, fill: "forwards" }),
  ];
  // 3. name and role travel from the button into the header
  if (name && triggerName) anims.push(name.animate([{ transform: invert(triggerName, name) }, { transform: "none" }], { duration: 420, easing: EMPHASIZED }));
  if (role && triggerRole) anims.push(role.animate([{ transform: invert(triggerRole, role) }, { transform: "none" }], { duration: 420, easing: EMPHASIZED }));
  await settled(anims);
  shadow.style.opacity = "1";
  dim.style.opacity = String(DESKTOP_DIM_OPACITY);
  anims.forEach((a) => a.cancel());
}

/** Desktop close, ~0.35 s: content first, then the card folds back into the avatar. `revealTrigger` shows the button again under the last of it. */
export async function closeCard(parts: CardParts, revealTrigger: () => void, trigger: HTMLElement): Promise<void> {
  if (!motionAllowed()) {
    revealTrigger();
    return;
  }
  const { card, shadow, dim, avatar, name, role, extras, rows, triggerName, triggerRole } = parts;
  const anims: Animation[] = [
    ...rows.map((el) => el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-4px)" }], { duration: 120, easing: ACCELERATE, fill: "forwards" })),
    ...extras.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" })),
    shadow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }),
    dim.animate([{ opacity: DESKTOP_DIM_OPACITY }, { opacity: 0 }], { duration: 240, fill: "forwards" }),
    avatar.animate([{ borderRadius: "12px", transform: "none" }, { borderRadius: "999px", transform: "scale(.9)" }], { duration: 280, easing: STANDARD, fill: "forwards" }),
    card.animate([{ "--r": `${bloomRadius(card)}px` }, { "--r": `${buttonRadius(trigger, avatar)}px` }], { duration: 300, delay: 40, easing: ACCELERATE, fill: "forwards" }),
  ];
  if (name && triggerName) anims.push(name.animate([{ transform: "none" }, { transform: invert(triggerName, name) }], { duration: 280, easing: STANDARD, fill: "forwards" }));
  if (role && triggerRole) anims.push(role.animate([{ transform: "none" }, { transform: invert(triggerRole, role) }], { duration: 280, easing: STANDARD, fill: "forwards" }));
  // the button comes back under the last of the card and settles
  const reveal = window.setTimeout(() => {
    revealTrigger();
    trigger.animate(
      [{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "scale(1.015)", offset: 0.7 }, { opacity: 1, transform: "none" }],
      { duration: 220, easing: STANDARD });
  }, 200);
  await settled(anims);
  window.clearTimeout(reveal);
  revealTrigger();
}

export interface SheetParts {
  triggerAvatar: HTMLElement;
  sheet: HTMLElement;
  scrim: HTMLElement;
  /** The avatar in the sheet header, where the flying avatar lands. */
  avatar: HTMLElement;
  header: Element | null;
  rows: Element[];
}

/** A copy of the trigger avatar that flies between the app bar and the sheet header. */
function flyingAvatar(parts: SheetParts, reverse: boolean): { ghost: HTMLElement; frames: Keyframe[] } {
  const { triggerAvatar, sheet, avatar } = parts;
  const from = triggerAvatar.getBoundingClientRect();
  const previous = sheet.style.transform;
  sheet.style.transform = "none";
  const to = avatar.getBoundingClientRect();
  sheet.style.transform = previous;
  const ghost = triggerAvatar.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: "0", zIndex: "10002", pointerEvents: "none",
  });
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const s = to.width / from.width;
  // a gentle arc: sideways first, then down
  const frames: Keyframe[] = [
    { transform: "translate(0, 0) scale(1)", borderRadius: "999px" },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.28}px) scale(${1 + (s - 1) * 0.5})`, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, borderRadius: "12px" },
  ];
  if (!reverse) return { ghost, frames };
  // same arc flown backwards; the middle stop mirrors to 0.55, the ends are automatic
  return { ghost, frames: frames.slice().reverse().map((f, i) => ({ ...f, offset: i === 1 ? 0.55 : null })) };
}

/** Phone open, ~0.55 s. */
export async function openSheet(parts: SheetParts, hideTrigger: () => void): Promise<void> {
  const { sheet, scrim, avatar, header, rows, triggerAvatar } = parts;
  if (!motionAllowed()) {
    hideTrigger();
    scrim.style.opacity = String(SHEET_SCRIM_OPACITY);
    return;
  }
  await ended(triggerAvatar.animate([{ transform: "scale(1)" }, { transform: "scale(.92)" }], { duration: 90, easing: STANDARD }));
  const { ghost, frames } = flyingAvatar(parts, false);
  hideTrigger();
  avatar.style.visibility = "hidden";
  const anims: Animation[] = [
    sheet.animate([{ transform: "translateY(105%)" }, { transform: "translateY(-1.5%)", offset: 0.72 }, { transform: "none" }], { duration: 460, easing: EMPHASIZED }),
    scrim.animate([{ opacity: 0 }, { opacity: SHEET_SCRIM_OPACITY }], { duration: 300, easing: STANDARD, fill: "forwards" }),
    ghost.animate(frames, { duration: 440, easing: EMPHASIZED, fill: "forwards" }),
  ];
  const content: Animation[] = [
    ...(header ? [header.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 280, delay: 100, easing: EMPHASIZED, fill: "backwards" })] : []),
    ...rows.map((el, i) =>
      el.animate(
        [{ opacity: 0, transform: "translateY(12px)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
        { duration: 300, delay: 120 + i * 35, easing: EMPHASIZED, fill: "backwards" })),
  ];
  await settled(anims);
  avatar.style.visibility = "";
  ghost.remove();
  scrim.style.opacity = String(SHEET_SCRIM_OPACITY);
  anims.forEach((a) => a.cancel());
  await settled(content);
}

/** Phone close, ~0.35 s: rows fade, the sheet drops, the avatar flies back up. */
export async function closeSheet(parts: SheetParts, showTrigger: () => void): Promise<void> {
  const { sheet, scrim, avatar, rows, triggerAvatar } = parts;
  if (!motionAllowed()) {
    showTrigger();
    return;
  }
  const { ghost, frames } = flyingAvatar(parts, true);
  avatar.style.visibility = "hidden";
  const anims: Animation[] = [
    ...rows.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: "forwards" })),
    sheet.animate([{ transform: "none" }, { transform: "translateY(105%)" }], { duration: 300, delay: 40, easing: ACCELERATE, fill: "forwards" }),
    scrim.animate([{ opacity: SHEET_SCRIM_OPACITY }, { opacity: 0 }], { duration: 300, fill: "forwards" }),
    ghost.animate(frames, { duration: 320, easing: STANDARD, fill: "forwards" }),
  ];
  await settled(anims);
  ghost.remove();
  showTrigger();
  triggerAvatar.animate([{ transform: "scale(.94)" }, { transform: "scale(1.04)", offset: 0.7 }, { transform: "none" }], { duration: 200, easing: STANDARD });
}
