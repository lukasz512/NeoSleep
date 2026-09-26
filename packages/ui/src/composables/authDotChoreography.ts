// Pure math behind AuthDotGridBackground (NEO-103), kept out of the component
// so the timing and shapes can be unit-tested without a canvas.
//
// Two independent motions:
//   - the ambient "delta wave": the grid undulates vertically like a slow-wave
//     (delta) EEG trace, its brighter crest drifting left → right;
//   - the "card inhale": while a sign-in is in flight the card draws the dots
//     in (nearest first) and they shrink to nothing; on an error it breathes
//     them back out, overshooting their spot slightly before settling.

/** Full inhale / exhale, in ms — both 1.5 s (decided with Łukasz, NEO-103). */
export const INHALE_MS = 1500;
export const EXHALE_MS = 1500;
/** Share of the total one dot spends in its own tween; the rest is the stagger across the field. */
const DOT_TWEEN_SHARE = 0.5;
/** Farthest a dot travels toward the card while being inhaled, in px. */
export const INHALE_TRAVEL_MAX = 90;
/** Share of a dot's distance to the card it travels, before INHALE_TRAVEL_MAX caps it. */
const INHALE_TRAVEL_SHARE = 0.4;
/** Random jitter mixed into the nearest-first order, so the front isn't a perfect circle. */
const ORDER_JITTER = 0.15;

// --- Delta wave -------------------------------------------------------------
const WAVE_LENGTH = 520;
const WAVE_LENGTH_SLOW = 830;
/** Seconds per crest passing a given dot. */
export const WAVE_PERIOD_S = 9;
/** The slower, counter-running wave's speed relative to the main one (9 s vs 13 s). */
const WAVE_SLOW_RATIO = 9 / 13;
const WAVE_AMPLITUDE = 3.5;
const WAVE_AMPLITUDE_SLOW = 2;
/** Phase step per grid row — tilts the crest so it reads as a travelling ribbon, not a column. */
const WAVE_ROW_SHIFT = 0.35;
/** Sharpens the crest: only a narrow band near the top of the wave lights up. */
const WAVE_CREST_SHARPNESS = 2.4;

export type InhaleMode = "idle" | "inhale" | "exhale";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}

/** Overshoots past 1 before settling — the "breathed back out a bit too far" feel. */
export function easeOutBack(t: number): number {
  const c1 = 1.7;
  const c3 = c1 + 1;
  const x = clamp(t, 0, 1) - 1;
  return 1 + c3 * x ** 3 + c1 * x ** 2;
}

/**
 * Wave phase advances by integration (phase += dt · ω), never as clock × speed:
 * multiplying a large clock by a changing speed jumps the phase and makes the
 * grid whip (the glitch in the first design mock).
 */
export function advanceWavePhase(phase: number, dtMs: number): number {
  // Wrapped at 13 full turns — the first point where both waves (9 s and 13 s)
  // line up again — so the wrap never shows as a jump, and the float stays small.
  return (phase + (dtMs / 1000) * ((2 * Math.PI) / WAVE_PERIOD_S)) % (Math.PI * 2 * 13);
}

/** Vertical offset (px) and crest brightness (0..1) of the dot at home (x, row). */
export function deltaWave(homeX: number, row: number, phase: number): { offsetY: number; crest: number } {
  const main = Math.sin(((2 * Math.PI) / WAVE_LENGTH) * homeX - phase + row * WAVE_ROW_SHIFT);
  const slow = Math.sin(((2 * Math.PI) / WAVE_LENGTH_SLOW) * homeX + phase * WAVE_SLOW_RATIO);
  return {
    offsetY: WAVE_AMPLITUDE * main + WAVE_AMPLITUDE_SLOW * slow,
    crest: ((main + 1) / 2) ** WAVE_CREST_SHARPNESS,
  };
}

/** 0..1 start slot within the stagger window: nearest to the card first, with a little jitter. */
export function inhaleOrder(distanceNorm: number, jitter: number): number {
  return clamp(distanceNorm, 0, 1) * (1 - ORDER_JITTER) + clamp(jitter, 0, 1) * ORDER_JITTER;
}

/**
 * Visibility (1 = fully there, 0 = inhaled) of one dot `elapsedMs` into a
 * mode, tweening from `startVisibility` — whatever the dot showed when the
 * mode began, so an error that lands mid-inhale reverses from where each dot
 * actually is instead of jumping.
 */
export function dotVisibility(
  mode: InhaleMode,
  elapsedMs: number,
  order: number,
  startVisibility: number,
): number {
  if (mode === "idle") return startVisibility;
  const total = mode === "inhale" ? INHALE_MS : EXHALE_MS;
  const tween = total * DOT_TWEEN_SHARE;
  const spread = total - tween;
  const progress = clamp((elapsedMs - order * spread) / tween, 0, 1);
  return startVisibility + ((mode === "inhale" ? 0 : 1) - startVisibility) * easeInOutSine(progress);
}

/**
 * How a dot at visibility `v` is drawn: pulled toward the card by `pull` of its
 * (capped) travel, scaled by `radius`, faded by `opacity`, brightened by
 * `glow` while being drawn in.
 */
export function inhaleLook(
  mode: InhaleMode,
  visibility: number,
  distanceToCard: number,
): { pull: number; radius: number; opacity: number; glow: number } {
  const v = clamp(visibility, 0, 1);
  const travel = Math.min(distanceToCard * INHALE_TRAVEL_SHARE, INHALE_TRAVEL_MAX);
  // Exhale uses the overshooting curve on the way out, so dots land a touch
  // past home and settle back; inhale is a plain accelerating pull.
  const factor = mode === "exhale" ? 1 - easeOutBack(v) : (1 - v) ** 1.3;
  return {
    pull: travel * factor,
    radius: Math.sqrt(v),
    opacity: v,
    glow: mode === "inhale" ? (1 - v) * 0.6 : 0,
  };
}
