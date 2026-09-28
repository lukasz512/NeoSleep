/**
 * Placement for the account menu (NEO-154, reworked NEO-161 "Kropla"). The
 * avatar is a nail: the card's header avatar sits exactly on the app bar
 * avatar, and the card springs out of that point. The motion itself is plain
 * CSS in AppAccountMenu.vue (transform + opacity, the same glass material and
 * spring as the phone's bottom menu); this file only measures once, before
 * the card opens, and never per frame.
 */

/** The header avatar is this much bigger than the app bar one (40 / 32). */
export const AVATAR_GROWTH = 40 / 32;
/** Gap between the card edge and the header avatar (top and end). */
const AVATAR_INSET = 4;
/** Phone: the card floats this far from the screen's sides (as the bottom pill). */
const PHONE_SIDE = 8;
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
 * Positions the fixed card so its header avatar's centre sits exactly on the
 * trigger avatar's centre, and points the card's transform-origin at that
 * centre, so the CSS scale grows the card out of the avatar.
 */
export function placeCard({ triggerAvatar, card, phone }: CardPlacement): void {
  const a = triggerAvatar.getBoundingClientRect();
  const viewport = document.documentElement.clientWidth;
  const half = (a.height * AVATAR_GROWTH) / 2;
  const cx = a.left + a.width / 2;
  const cy = a.top + a.height / 2;
  const top = cy - half - AVATAR_INSET;
  const avatarEnd = viewport - (cx + half);
  if (phone) {
    Object.assign(card.style, { top: `${top}px`, left: `${PHONE_SIDE}px`, right: `${PHONE_SIDE}px` });
    card.style.setProperty("--account-menu-avatar-top", `${AVATAR_INSET}px`);
    card.style.setProperty("--account-menu-avatar-end", `${Math.max(0, avatarEnd - PHONE_SIDE)}px`);
  } else {
    Object.assign(card.style, { top: `${top}px`, right: `${avatarEnd - AVATAR_INSET}px`, left: "" });
    card.style.setProperty("--account-menu-avatar-top", `${AVATAR_INSET}px`);
    card.style.setProperty("--account-menu-avatar-end", `${AVATAR_INSET}px`);
  }
  // offsetWidth, not getBoundingClientRect: the closed card is scaled down.
  const left = phone ? PHONE_SIDE : viewport - (avatarEnd - AVATAR_INSET) - card.offsetWidth;
  card.style.setProperty("--account-menu-origin", `${cx - left}px ${cy - top}px`);
}
