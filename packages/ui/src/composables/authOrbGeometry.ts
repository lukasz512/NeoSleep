// Where the small login orb goes (NEO-103 follow-up). It is the big orb's
// "moon": it sits on the big orb's thin orbit ring, at the point just past the
// card's right edge, so it reads as part of one system instead of a stray
// circle left next to the card. On a phone the big orb's ring runs behind the
// card, so there it takes layout B (picked by Łukasz, 2026-09-26): low on the
// left, under the card, overlapping the big orb's edge — the three orbs read
// as one diagonal. Pure math, kept out of AuthOrbs.vue so it can be
// unit-tested; the sizes mirror AuthOrbs' CSS (0.8 / 0.16 vmax, ring at inset -4%).

/** Big orb center, as a share of the viewport (AuthOrbs' left: 80% / top: 90%). */
const BIG_CENTER = { x: 0.8, y: 0.9 };
/** Big orb radius as a share of vmax (width 80vmax). */
const BIG_RADIUS = 0.4;
/** The ring sits at inset -4% of the orb box: 8% wider than the orb. */
const RING_SCALE = 1.08;
/** Small orb radius as a share of vmax (width 16vmax). */
const SMALL_RADIUS = 0.08;
/** How far past the card's right edge the moon's center sits, in its own radii. */
const CARD_CLEARANCE = 0.55;
/** At most this share of the moon's diameter may leave the screen before a spot is rejected. */
const MAX_OFFSCREEN = 0.2;
/** Phone layout B: the small orb's center, as a share of the viewport. */
export const PHONE_SPOT = { x: 0.14, y: 0.86 };

export interface CardBox {
  top: number;
  right: number;
}

/** "ring": on the big orb's orbit next to the card. "phone": layout B, a fixed spot low on the left. */
export type MoonLayout = "ring" | "phone";

export interface MoonPlacement {
  layout: MoonLayout;
  x: number;
  y: number;
  /** The orbit the moon sways along (the big orb's ring); radius 0 = no sway. */
  orbitX: number;
  orbitY: number;
  orbitRadius: number;
  /** Resting angle on the orbit, radians (screen coordinates, y down). */
  angle: number;
}

/** On the big orb's ring, where it crosses a vertical line just right of the card — null when that spot isn't on screen. */
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
  // At most MAX_OFFSCREEN of the diameter may cross the right or top edge.
  const inset = radius * (1 - 2 * MAX_OFFSCREEN);
  if (x + inset > width || y - inset < 0) return null;
  return { layout: "ring", x, y, orbitX, orbitY, orbitRadius, angle: Math.atan2(y - orbitY, dx) };
}

export function placeMoon(width: number, height: number, card: CardBox): MoonPlacement {
  const ring = onBigRing(width, height, card);
  if (ring) return ring;
  const x = width * PHONE_SPOT.x;
  const y = height * PHONE_SPOT.y;
  return { layout: "phone", x, y, orbitX: x, orbitY: y, orbitRadius: 0, angle: 0 };
}

/**
 * Offset (px) from the moon's resting spot after swaying `angleDelta` radians
 * along the orbit, with the ring itself scaled by `ringScale` (the big orb
 * breathes, and the moon stays on its ring). Zero for the phone layout.
 */
export function moonOffset(placement: MoonPlacement, angleDelta: number, ringScale: number): { x: number; y: number } {
  const r = placement.orbitRadius * ringScale;
  const a = placement.angle + angleDelta;
  return {
    x: placement.orbitX + r * Math.cos(a) - placement.x,
    y: placement.orbitY + r * Math.sin(a) - placement.y,
  };
}
