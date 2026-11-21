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

/** From this width the page's events move the parcel across the page; narrower, it keeps to the left margin. */
export const ROUTE_WIDE = 700;
/** The page's column (NeoCrmApp's max-width); what is left beside it is free paper. */
const COLUMN = 1120;

/** How big the parcel is drawn, in px: one loose note is about half of it. */
export function parcelSize(width: number, gutter: number): number {
  return width >= ROUTE_WIDE ? clamp(34 + width * 0.03, 52, 84) : clamp(gutter * 1.7, 32, 44);
}

/** Scroll progress at which the route ends, so the parcel is still in the window (55 % down) when it gets there. */
export function launchAt(end: number, range: number, height: number): number {
  return range > 0 ? clamp((end - height * 0.55) / range, 0.5, 0.97) : 0.97;
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

// ---- the route that comes from the page (round 11) ----

/** The packing story, in timeline points (0 the hero note, 0.86 the sealed parcel; the plane runs on time after that). */
export const STORY = {
  /** the hero note has shrunk into the travelling note */
  peel: 0.06,
  /** the box flies in */
  boxIn: [0.06, 0.115],
  /** each note lands in the box at its own moment: the hero's first, then one balloon, the windmill, and two balloons from the other side */
  pickups: [0.12, 0.21, 0.39, 0.44],
  /** the fan blows */
  gust: [0.27, 0.35],
  fan: 0.31,
  stamp: 0.83,
  sealed: 0.86,
} as const;

/** How many notes are in the box at `g` of the story. */
export function collected(g: number): number {
  return STORY.pickups.filter((at) => g >= at).length;
}

type Point = { x: number; y: number };

/** A parabola from `from` to `to` that bows `bow` px upwards half-way (the box's way in). */
export function arc(t: number, from: Point, to: Point, bow: number): Point {
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) - 4 * bow * t * (1 - t) };
}

/** The steps the parcel tumbles down after the kick. */
export const STAIRS = 3;

export type RouteEvent = {
  kind: "catch" | "fan" | "stamp" | "spring" | "bounce";
  /** page y where it starts to act, and for how many px */
  at: number;
  span: number;
  /** where it leaves the parcel */
  to: number;
  /** how high the parcel hops meanwhile, in px */
  lift: number;
};
/** Where the parcel starts and what moves it on the way down, top to bottom. */
export type Route = { x0: number; events: RouteEvent[] };

/** The parcel's x at page height `y`: it falls straight, and only an event moves it sideways. */
export function eventX(y: number, route: Route): number {
  let x = route.x0;
  for (const e of route.events) {
    if (y <= e.at) break;
    const t = clamp((y - e.at) / e.span);
    x = t >= 1 ? e.to : lerp(x, e.to, t * t * (3 - 2 * t));
  }
  return x;
}

/** How high an event has the parcel hop at page height `y`. */
export function eventLift(y: number, route: Route): number {
  let lift = 0;
  for (const e of route.events) {
    const t = (y - e.at) / e.span;
    // the kick sends it down three steps: a hop for each, landing on the step
    if (t > 0 && t < 1) lift = Math.max(lift, e.lift * (e.kind === "stamp" ? Math.abs(Math.sin(STAIRS * Math.PI * t)) * (1 - 0.35 * t) : Math.sin(Math.PI * t)));
  }
  return lift;
}

/** Where on the route (0..1) the fan and the stamp stand, and how much route the stamp takes to seal the parcel. */
export type Anchors = { fan: number; stamp: number; pad: number };

/** The fan stands at the first of the two page heights `a`, `b`, the stamp at the second; a page without them still gets both. */
export function anchors(start: number, end: number, a: number, b: number): Anchors {
  const len = Math.max(1, end - start);
  const ys = [a, b].filter((y) => Number.isFinite(y)).sort((p, q) => p - q);
  const [first, second] = ys;
  // the four notes need room before the fan
  const fan = clamp(first === undefined ? 0.22 : (first - start) / len, Math.min(0.3, 520 / len), 0.6);
  const stamp = clamp(second === undefined ? 0.6 : (second - start) / len, fan + 0.12, 0.92);
  return { fan, stamp, pad: Math.min(0.05, 240 / len, (1 - stamp) / 2) };
}

function knots(a: Anchors): [number, number][] {
  return [
    [0, 0],
    [a.fan, STORY.fan],
    [a.stamp, STORY.stamp],
    [a.stamp + a.pad, STORY.sealed],
  ];
}

/** Route fraction to story point: the box is open at the fan and gets its postmark at the stamp. */
export function packAt(fraction: number, a: Anchors): number {
  const f = Number.isFinite(fraction) ? clamp(fraction) : 0;
  const k = knots(a);
  for (let i = 1; i < k.length; i++) {
    const [f0, g0] = k[i - 1] ?? [0, 0];
    const [f1, g1] = k[i] ?? [1, STORY.sealed];
    if (f <= f1) return lerp(g0, g1, (f - f0) / (f1 - f0));
  }
  return STORY.sealed;
}

/** The inverse: how far down the route the story point `g` happens. */
export function fractionAt(g: number, a: Anchors): number {
  const k = knots(a);
  for (let i = 1; i < k.length; i++) {
    const [f0, g0] = k[i - 1] ?? [0, 0];
    const [f1, g1] = k[i] ?? [1, STORY.sealed];
    if (g <= g1) return lerp(f0, f1, clamp((g - g0) / (g1 - g0)));
  }
  return a.stamp + a.pad;
}

/** What the page looks like to the parcel, in page px. */
export type Page = {
  width: number;
  gutter: number;
  /** the hero note it starts from */
  x0: number;
  start: number;
  end: number;
  /** the middle of the free strip between a section's heading and its body; NaN when the page has none */
  channel: number;
  /** how wide that strip is, px; the parcel only uses it when it fits */
  gap: number;
  /** tops of the sections where the fan and the stamp stand (NaN when missing) */
  fanY: number;
  stampY: number;
  /** tile edges the parcel bounces off */
  edges: number[];
};
export type Plan = { route: Route; anchors: Anchors; fan: { x: number; y: number; dir: 1 | -1 } };

const BOUNCE = 220;

/** The route for this page: the box catches the note, the fan blows it across, the stamp knocks it back, tiles make it hop. */
export function planRoute(page: Page): Plan {
  const { width, gutter, start, end } = page;
  const size = parcelSize(width, gutter);
  const wide = width >= ROUTE_WIDE;
  const len = Math.max(1, end - start);
  const inWindow = (x: number) => clamp(x, size / 2, Math.max(size / 2, width - size / 2));
  const margin = Math.max(0, (width - COLUMN) / 2) + gutter;
  const left = inWindow(wide ? Math.max(margin / 2, size * 0.6) : Math.max(gutter * 0.5, size * 0.42));
  const right = wide ? inWindow(width - left) : left;
  const a = anchors(start, end, page.fanY, page.stampY);
  const yAt = (g: number) => start + fractionAt(g, a) * len;
  const free = Number.isFinite(page.channel) && page.gap >= size + 12 && page.channel > size / 2 && page.channel < width - size / 2;
  const lane = wide ? (free ? page.channel : inWindow(left + size * 1.1)) : left;

  const stampAt = yAt(0.835);
  const big: RouteEvent[] = [
    { kind: "catch", at: yAt(0.108), span: Math.max(1, (yAt(0.15) - yAt(0.108)) * 2), to: lane, lift: size * 0.4 },
    { kind: "fan", at: yAt(STORY.gust[0]), span: Math.max(1, (yAt(STORY.gust[1]) - yAt(STORY.gust[0])) * 1.7), to: right, lift: size * 0.35 },
    { kind: "stamp", at: stampAt, span: Math.max(1, Math.min(440, end - stampAt)), to: left, lift: size * 0.5 },
  ];
  // a spring waits between the last pickup and the tape: the parcel lands on it and is thrown high
  const springAt = yAt(0.5);
  big.push({ kind: "spring", at: springAt, span: 300, to: 0, lift: size * 1.1 });
  const bounces: RouteEvent[] = [];
  let lastAt = -Infinity;
  for (const y of page.edges.filter((edge) => Number.isFinite(edge)).sort((p, q) => p - q)) {
    if (bounces.length >= 3) break;
    if (y <= start || y + BOUNCE >= end || y - lastAt < 200) continue;
    if (big.some((e) => y + BOUNCE > e.at - 60 && y < e.at + e.span + 60)) continue;
    bounces.push({ kind: "bounce", at: y, span: BOUNCE, to: 0, lift: size * 0.3 });
    lastAt = y;
  }

  // a tile edge knocks the parcel a little towards the middle, the next one back into its lane
  const kick = wide ? Math.min(40, width * 0.035) : 0;
  const x0 = inWindow(page.x0);
  let rest = x0;
  let x = x0;
  const events = [...big, ...bounces]
    .sort((p, q) => p.at - q.at)
    .map((e) => {
      const to = e.kind === "spring" ? x : e.kind !== "bounce" ? e.to : x === rest ? inWindow(rest + (rest < width / 2 ? kick : -kick)) : rest;
      if (e.kind !== "bounce" && e.kind !== "spring") rest = to;
      x = to;
      return { ...e, to };
    });

  return {
    route: { x0, events },
    anchors: a,
    fan: { x: wide ? left : width - size * 0.7, y: start + a.fan * len, dir: wide ? 1 : -1 },
  };
}

/** Where the window has to be for the note to leave: until then it waits in the hero. */
export function waitTop(noteY: number, height: number): number {
  return Math.max(0, noteY - height * 0.6);
}

/** How far down its route the parcel is with the window at `top`: 0 while the note waits, 1 from `launchTop` on. */
export function routeFraction(top: number, wait: number, launchTop: number): number {
  return clamp((top - wait) / Math.max(1, launchTop - wait));
}

/** Which launch step is lit at `progress` through the section (0..1): forward with the scroll, and back. */
export function launchStep(progress: number, count: number): number {
  return Number.isFinite(progress) ? clamp(Math.floor(progress * count), 0, Math.max(0, count - 1)) : 0;
}

/** Progress through a pinned section: its content, `held` px tall, sticks at `stick` px while the section (`top`, `height`) scrolls by. */
export function pinProgress(top: number, height: number, held: number, stick: number): number {
  return clamp((stick - top) / Math.max(1, height - held));
}

/** Progress when nothing is pinned: 0 with the steps' top 75 % down the window, 1 at 25 %. */
export function passProgress(top: number, viewport: number): number {
  return clamp((viewport * 0.75 - top) / Math.max(1, viewport * 0.5));
}

/** One of `n` stars thrown when a note lands, `age` seconds on: up in a fan, down again, gone in under a second. */
export function star(age: number, i: number, n: number): { x: number; y: number; spin: number; scale: number; alpha: number } {
  const angle = -Math.PI / 2 + (n > 1 ? i / (n - 1) - 0.5 : 0) * 1.8;
  const speed = 150 + 40 * ((i * 7) % 3);
  return {
    x: Math.cos(angle) * speed * age || 0,
    y: Math.sin(angle) * speed * age + 260 * age * age || 0,
    spin: age * (4 + (i % 3)) * (i % 2 ? -1 : 1),
    scale: 0.7 + 0.3 * ((i * 5) % 3) * 0.5 + 0.4 * Math.sin(Math.PI * clamp(age / 0.9)),
    alpha: clamp((0.9 - age) / 0.4),
  };
}
