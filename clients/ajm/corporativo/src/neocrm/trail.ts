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

/** Where the flat object is, `y` px down a margin `width` px wide. Its route is never drawn (round 10). */
export function trailX(y: number, width: number): number {
  const swing = Math.max(0, Math.min(14, width / 2 - 3));
  return width / 2 + swing * Math.sin(y / WAVE);
}

/** How much the object leans, following its route's bend at `y`. */
export function trailTilt(y: number): number {
  return Math.cos(y / WAVE) * 14;
}

// ---- the living paper and the 3D parcel (rounds 7 to 10, LivePaper.vue) ----

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type TrailMode = "still" | "flat" | "live";

/** Nothing moves for a reader who asked for less motion; without WebGL, or on a data saver, the flat object stays. */
export function trailMode(env: { reduced: boolean; saveData: boolean; webgl: boolean }): TrailMode {
  if (env.reduced) return "still";
  return env.webgl && !env.saveData ? "live" : "flat";
}

/** From this width the parcel swings across the page; narrower, it keeps to the left margin. */
export const ROUTE_WIDE = 700;
/** The page's column (NeoCrmApp's max-width); what is left beside it is free paper. */
const COLUMN = 1120;

/** How big the parcel is drawn, in px: one loose note is about half of it. */
export function parcelSize(width: number, gutter: number): number {
  return width >= ROUTE_WIDE ? clamp(34 + width * 0.03, 52, 84) : clamp(gutter * 1.7, 32, 44);
}

export type RouteShape = { cx: number; amp: number; wave: number };

/** The route nobody sees: a slow swing from one free margin to the other, or a quiet line down the left one. */
export function routeShape(width: number, gutter: number): RouteShape {
  const size = parcelSize(width, gutter);
  if (width < ROUTE_WIDE) return { cx: Math.max(gutter * 0.5, size * 0.42), amp: 0, wave: WAVE };
  const margin = Math.max(0, (width - COLUMN) / 2) + gutter;
  const amp = width / 2 - Math.max(margin / 2, size * 0.6);
  return { cx: width / 2, amp, wave: Math.max(1300, amp * 3.8) };
}

/** The parcel's x, `s` px down the page from where its route starts. It only ever goes down: no loops. */
export function routeX(s: number, shape: RouteShape, gutter: number): number {
  if (!shape.amp) return shape.cx + Math.min(10, gutter * 0.12) * Math.sin(s / shape.wave);
  const c = Math.cos((2 * Math.PI * s) / shape.wave);
  // flattened at both ends, so the parcel lingers on the free margins and crosses the text quickly
  return shape.cx + shape.amp * c * (1.5 - 0.5 * c * c);
}

/** The packing is finished at this point of the timeline; what is left is the plane. */
export const LAUNCH = 0.9;

/** Scroll progress at which the route ends, so the parcel is still in the window (55 % down) when it gets there. */
export function launchAt(end: number, range: number, height: number): number {
  return range > 0 ? clamp((end - height * 0.55) / range, 0.5, 0.97) : 0.97;
}

/** Scroll progress to the packing timeline: `launch` lands on LAUNCH, the page's end on 1. */
export function timeline(progress: number, launch: number): number {
  const g = Number.isFinite(progress) ? clamp(progress) : 0;
  return g < launch ? (LAUNCH * g) / launch : LAUNCH + ((1 - LAUNCH) * (g - launch)) / (1 - launch);
}

/** How far down its route the parcel is at `q` of the timeline. */
export function tipS(q: number, start: number, end: number): number {
  return lerp(start, end, clamp(q / LAUNCH));
}

/** The plane takes this long to reach the demo button, however fast the reader scrolls. */
export const FLIGHT_MS = 2800;

/** One frame of something that runs on time, not on scroll: `value` moves towards `target` (0 or 1). */
export function glide(value: number, target: number, dt: number, duration: number): number {
  const step = dt / duration;
  return target > value ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** The dots and the tiles react fully in the hero and more calmly under the text (0.45). */
export function paperStrength(top: number, height: number): number {
  return lerp(1, 0.45, clamp(top / (height * 0.8)));
}

/** How far something `dx, dy` away from a thing is pushed off it: `force` px next to it, nothing from `radius` on. */
export function pushAway(dx: number, dy: number, radius: number, force: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d >= radius || d < 0.1) return { x: 0, y: 0 };
  const f = Math.pow(1 - d / radius, 2) * force;
  return { x: (dx / d) * f, y: (dy / d) * f };
}

/** A tile makes a little room when the parcel passes: at most 4 px, measured from the tile's nearest edge. */
export function tileNudge(px: number, py: number, tile: { x: number; y: number; w: number; h: number }, strength = 1): { x: number; y: number } {
  const nx = clamp(px, tile.x, tile.x + tile.w);
  const ny = clamp(py, tile.y, tile.y + tile.h);
  const inside = nx === px && ny === py;
  // under the tile itself the push comes from the tile's middle
  const from = inside ? { x: tile.x + tile.w / 2 - px, y: tile.y + tile.h / 2 - py } : { x: nx - px, y: ny - py };
  const d = Math.hypot(from.x, from.y) || 1;
  const near = inside ? 1 : Math.pow(clamp(1 - d / 160), 2);
  return { x: (from.x / d) * near * 4 * strength, y: (from.y / d) * near * 4 * strength };
}
