/**
 * Positioning math for MandibularRuler.vue, kept apart so it can be tested
 * without a layout engine.
 */

/** ±20 mm maps to the ruler's full width (OA's MR/MP range). */
export const RULER_RANGE_MM = 20;

/** A mm value → its left offset on the track, in % (0 mm = 50 %), clamped to the scale. */
export function rulerPercent(mm: number): number {
  const clamped = Math.max(-RULER_RANGE_MM, Math.min(RULER_RANGE_MM, mm));
  return 50 + (clamped / RULER_RANGE_MM) * 50;
}

/**
 * Where each incisor image's incisal tip sits, as a fraction of the image's
 * own width, plus the width it is drawn at. Measured from the PNGs in
 * assets/orthoapnea/teeth/: incisor-sup.png (36×48) ends in a 2-px tip at
 * columns 30–31 of its bottom row → 31/36; incisor-inf.png (37×33) starts
 * with a 5-px tip at columns 31–35 of its top row → 33.5/37. Both drawn at
 * the same scale (30/36), so the two teeth match in size.
 */
export const INCISOR_TIP = {
  sup: { tipX: 31 / 36, widthPx: 30 },
  inf: { tipX: 33.5 / 37, widthPx: 31 },
} as const;

export interface IncisorTip {
  tipX: number;
  widthPx: number;
}

/**
 * Inline style placing an incisor so its tip — not its centre — lands on
 * `positionPercent` of the track: the box starts at that point and is pulled
 * left by the tip's share of its own width.
 */
export function incisorStyle(positionPercent: number, tip: IncisorTip): { left: string; width: string; transform: string } {
  return {
    left: `${positionPercent}%`,
    width: `${tip.widthPx}px`,
    transform: `translateX(-${(tip.tipX * 100).toFixed(3)}%)`,
  };
}
