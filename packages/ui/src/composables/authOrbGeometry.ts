// Where the small login orb goes (NEO-103 follow-up). It is the big orb's
// "moon": it sits on the big orb's thin orbit ring, at the point just past the
// card's right edge, so it reads as part of one system instead of a stray
// circle left next to the card. Pure math, kept out of AuthOrbs.vue so it can
// be unit-tested; the sizes mirror AuthOrbs' CSS (0.8 / 0.16 vmax, ring at
// inset -4%).

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
/** At most this share of the moon's diameter may leave the screen before it is dropped. */
const MAX_OFFSCREEN = 0.2;

export interface CardBox {
  top: number;
  right: number;
}

export interface MoonPlacement {
  /** False when the ring doesn't reach a spot next to the card on this screen (e.g. a phone) — the moon is not drawn. */
  visible: boolean;
  x: number;
  y: number;
  /** Big orb center and ring radius — the orbit the moon sways along. */
  orbitX: number;
  orbitY: number;
  orbitRadius: number;
  /** Resting angle on the orbit, radians (screen coordinates, y down). */
  angle: number;
}

export function placeMoon(width: number, height: number, card: CardBox): MoonPlacement {
  const vmax = Math.max(width, height);
  const orbitX = width * BIG_CENTER.x;
  const orbitY = height * BIG_CENTER.y;
  const orbitRadius = vmax * BIG_RADIUS * RING_SCALE;
  const radius = vmax * SMALL_RADIUS;

  const x = card.right + radius * CARD_CLEARANCE;
  const dx = x - orbitX;
  const hidden = { visible: false, x, y: 0, orbitX, orbitY, orbitRadius, angle: 0 };
  if (Math.abs(dx) >= orbitRadius) return hidden;

  // Upper crossing of the ring with that vertical line.
  const y = orbitY - Math.sqrt(orbitRadius ** 2 - dx ** 2);
  // At most MAX_OFFSCREEN of the diameter may cross the right or top edge.
  const inset = radius * (1 - 2 * MAX_OFFSCREEN);
  const onScreen = x + inset <= width && y - inset >= 0;
  if (!onScreen) return hidden;
  return { visible: true, x, y, orbitX, orbitY, orbitRadius, angle: Math.atan2(y - orbitY, dx) };
}

/**
 * Offset (px) from the moon's resting spot after swaying `angleDelta` radians
 * along the orbit, with the ring itself scaled by `ringScale` (the big orb
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
