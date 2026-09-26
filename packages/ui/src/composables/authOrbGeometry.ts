// Where the small login orb goes (NEO-103 follow-up). It is the big orb's
// "moon": it sits on the big orb's thin orbit ring, at the point just past the
// card's right edge, so it reads as part of one system instead of a stray
// circle left next to the card. On a phone the big orb's ring runs behind the
// card, so there the moon moves to the medium orb's ring instead, in the free
// band above the logo. Pure math, kept out of AuthOrbs.vue so it can be
// unit-tested; the sizes mirror AuthOrbs' CSS (0.8 / 0.336 / 0.16 vmax, ring
// at inset -4%).

/** Big orb center, as a share of the viewport (AuthOrbs' left: 80% / top: 90%). */
const BIG_CENTER = { x: 0.8, y: 0.9 };
/** Big orb radius as a share of vmax (width 80vmax). */
const BIG_RADIUS = 0.4;
/** Medium orb center (AuthOrbs' left: 20% / top: 18%) and radius (width 33.6vmax). */
const MEDIUM_CENTER = { x: 0.2, y: 0.18 };
const MEDIUM_RADIUS = 0.168;
/** The ring sits at inset -4% of the orb box: 8% wider than the orb. */
const RING_SCALE = 1.08;
/** Small orb radius as a share of vmax (width 16vmax). */
const SMALL_RADIUS = 0.08;
/** How far past the card's right edge the moon's center sits, in its own radii. */
const CARD_CLEARANCE = 0.55;
/** Room kept free above the card for the logo block, in px — the medium-ring moon stays above it. */
const LOGO_CLEARANCE = 75;
/** At most this share of the moon's diameter may leave the screen before a spot is rejected. */
const MAX_OFFSCREEN = 0.2;

export interface CardBox {
  top: number;
  right: number;
}

export type MoonHost = "big" | "medium";

export interface MoonPlacement {
  /** False when neither ring reaches a free spot on this screen — the moon is not drawn. */
  visible: boolean;
  /** Which orb's ring the moon sits on (it follows that orb's breath and drift). */
  host: MoonHost;
  x: number;
  y: number;
  /** Host orb center and ring radius — the orbit the moon sways along. */
  orbitX: number;
  orbitY: number;
  orbitRadius: number;
  /** Resting angle on the orbit, radians (screen coordinates, y down). */
  angle: number;
}

function onScreen(x: number, y: number, radius: number, width: number): boolean {
  // At most MAX_OFFSCREEN of the diameter may cross the left, right or top edge.
  const inset = radius * (1 - 2 * MAX_OFFSCREEN);
  return x - inset >= 0 && x + inset <= width && y - inset >= 0;
}

/** On the big orb's ring, where it crosses a vertical line just right of the card. */
function onBigRing(width: number, height: number, card: CardBox): MoonPlacement | null {
  const vmax = Math.max(width, height);
  const orbitX = width * BIG_CENTER.x;
  const orbitY = height * BIG_CENTER.y;
  const orbitRadius = vmax * BIG_RADIUS * RING_SCALE;
  const radius = vmax * SMALL_RADIUS;
  const x = card.right + radius * CARD_CLEARANCE;
  const dx = x - orbitX;
  if (Math.abs(dx) >= orbitRadius) return null;
  const y = orbitY - Math.sqrt(orbitRadius ** 2 - dx ** 2);
  if (!onScreen(x, y, radius, width)) return null;
  return { visible: true, host: "big", x, y, orbitX, orbitY, orbitRadius, angle: Math.atan2(y - orbitY, dx) };
}

/** On the medium orb's ring, up and to the right, just clear of the logo above the card. */
function onMediumRing(width: number, height: number, card: CardBox): MoonPlacement | null {
  const vmax = Math.max(width, height);
  const orbitX = width * MEDIUM_CENTER.x;
  const orbitY = height * MEDIUM_CENTER.y;
  const orbitRadius = vmax * MEDIUM_RADIUS * RING_SCALE;
  const radius = vmax * SMALL_RADIUS;
  const sin = (card.top - LOGO_CLEARANCE - radius - orbitY) / orbitRadius;
  if (sin < -1) return null;
  const angle = Math.asin(Math.min(1, sin));
  const x = orbitX + orbitRadius * Math.cos(angle);
  const y = orbitY + orbitRadius * Math.sin(angle);
  if (!onScreen(x, y, radius, width)) return null;
  return { visible: true, host: "medium", x, y, orbitX, orbitY, orbitRadius, angle };
}

const NOWHERE: MoonPlacement = { visible: false, host: "big", x: 0, y: 0, orbitX: 0, orbitY: 0, orbitRadius: 0, angle: 0 };

export function placeMoon(width: number, height: number, card: CardBox): MoonPlacement {
  return onBigRing(width, height, card) ?? onMediumRing(width, height, card) ?? NOWHERE;
}

/**
 * Offset (px) from the moon's resting spot after swaying `angleDelta` radians
 * along the orbit, with the ring itself scaled by `ringScale` (the host orb
 * breathes, and the moon stays on its ring).
 */
export function moonOffset(placement: MoonPlacement, angleDelta: number, ringScale: number): { x: number; y: number } {
  const r = placement.orbitRadius * ringScale;
  const a = placement.angle + angleDelta;
  return {
    x: placement.orbitX + r * Math.cos(a) - placement.x,
    y: placement.orbitY + r * Math.sin(a) - placement.y,
  };
}
