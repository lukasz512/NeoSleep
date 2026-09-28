/**
 * Placement for the account menu (NEO-154, reworked NEO-161 "Kropla"). The
 * card opens next to the app bar avatar; the avatar itself grows and flies
 * into the card's top-right corner, where it sits with the same inset as the
 * card's content (so the header reads as one designed block, not a button
 * pinned onto a card).
 *
 * The motion itself is plain CSS in AppAccountMenu.vue (transform + opacity,
 * the same glass material and spring as the phone's bottom menu); this file
 * only measures once, before the card opens, and never per frame.
 */

/** The avatar in the app bar (AppLayout). */
export const BAR_AVATAR_SIZE = 32;
/** The avatar in the menu's header: bigger, in the card's top-right corner. */
export const MENU_AVATAR_SIZE = 56;
/** Inset of the header avatar from the card's top and end edge — the card's own content padding. */
export const MENU_AVATAR_INSET = 16;
/** Phone: how far the app bar avatar swells under the finger (AppAccountMenu CSS). */
export const PHONE_PRESS_SCALE = 1.12;
/** The closed card's scale (AppAccountMenu CSS, `.account-menu__card`). */
export const CARD_CLOSED_SCALE = 0.94;

/** Phone: the card floats this far from the screen's sides and top (as the bottom pill). */
const PHONE_SIDE = 8;
/** Desktop: the card reaches this far past the bar avatar's end and top edge. */
const DESKTOP_OVERHANG = 12;
/** How long the CSS close transition runs (AppAccountMenu.vue, --menu-dur-out). */
export const CLOSE_DURATION = 180;

/**
 * Whether CSS transitions will actually run: a real browser (jsdom has no
 * layout and no Element.animate) without prefers-reduced-motion.
 */
export function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof Element.prototype.animate !== "function") return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export interface CardPlacement {
  /** The avatar inside the trigger button. */
  triggerAvatar: Element;
  /** Fixed-position card that wraps the menu panel. */
  card: HTMLElement;
  /** Phone: the card spans the screen (minus PHONE_SIDE); desktop: 340px card. */
  phone: boolean;
}

/**
 * Positions the fixed card by the app bar avatar and sets where the header
 * avatar flies from: `--account-menu-fly` is the transform that puts the
 * header avatar exactly over the bar avatar (at its size) while the card is
 * closed. The card scales around the header avatar's centre, so that point
 * stays put and the flight is a plain translate + scale.
 */
export function placeCard({ triggerAvatar, card, phone }: CardPlacement): void {
  const a = triggerAvatar.getBoundingClientRect();
  const viewport = document.documentElement.clientWidth;
  let top: number;
  let right: number;
  if (phone) {
    top = PHONE_SIDE;
    right = PHONE_SIDE;
    Object.assign(card.style, { top: `${top}px`, left: `${PHONE_SIDE}px`, right: `${right}px` });
  } else {
    top = Math.max(PHONE_SIDE, a.top - DESKTOP_OVERHANG);
    right = Math.max(PHONE_SIDE, viewport - a.right - DESKTOP_OVERHANG);
    Object.assign(card.style, { top: `${top}px`, right: `${right}px`, left: "" });
  }
  card.style.setProperty("--account-menu-avatar-top", `${MENU_AVATAR_INSET}px`);
  card.style.setProperty("--account-menu-avatar-end", `${MENU_AVATAR_INSET}px`);

  // Where the header avatar's centre lands (screen), and where the bar avatar's is.
  const half = MENU_AVATAR_SIZE / 2;
  const ox = viewport - right - MENU_AVATAR_INSET - half;
  const oy = top + MENU_AVATAR_INSET + half;
  const bx = a.left + a.width / 2;
  const by = a.top + a.height / 2;
  // The closed card is scaled around (ox, oy), which scales the flight too.
  const s = CARD_CLOSED_SCALE;
  const k = a.width / MENU_AVATAR_SIZE / s;
  card.style.setProperty("--account-menu-origin", `calc(100% - ${MENU_AVATAR_INSET + half}px) ${MENU_AVATAR_INSET + half}px`);
  card.style.setProperty("--account-menu-fly", `translate(${(bx - ox) / s}px, ${(by - oy) / s}px) scale(${k})`);
}
