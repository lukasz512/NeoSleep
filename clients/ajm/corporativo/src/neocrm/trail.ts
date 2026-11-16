/** The shapes the travelling object takes on the way down the page, in order (ScrollTrail.vue). */
export const TRAIL_STAGES = ["note", "stack", "box", "sealed", "parcel", "plane"] as const;
export type TrailStage = (typeof TRAIL_STAGES)[number];

/** Which shape is on screen at `progress` (0 top of the page, 1 the demo request) and how far into it (0..1). */
export function trailStage(progress: number): { stage: number; p: number } {
  const at = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  if (at >= 1) return { stage: TRAIL_STAGES.length - 1, p: 1 };
  const stage = Math.floor(at * TRAIL_STAGES.length);
  return { stage, p: at * TRAIL_STAGES.length - stage };
}

const WAVE = 90;

/** Where the hand-drawn thread is, `y` px down a margin `width` px wide. */
export function trailX(y: number, width: number): number {
  const swing = Math.max(0, Math.min(14, width / 2 - 3));
  return width / 2 + swing * Math.sin(y / WAVE);
}

/** The whole thread as one SVG path. */
export function trailPath(height: number, width: number): string {
  if (height <= 0) return "";
  let d = `M${trailX(0, width).toFixed(1)} 0`;
  for (let y = 10; y <= height; y += 10) d += `L${trailX(y, width).toFixed(1)} ${y}`;
  return d;
}

/** How much the object leans, following the thread's bend at `y`. */
export function trailTilt(y: number): number {
  return Math.cos(y / WAVE) * 14;
}
