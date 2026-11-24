/**
 * Per-element pointer physics (CORE-215). Every element marked `data-phys="<kind>"` is a small spring
 * system with its own personality: notes flee the pointer, the pencil is pulled in, glass swells,
 * keys press down, the parcel bounces. State is applied through the independent CSS properties
 * `translate`, `rotate` and `scale`, so it composes with whatever `transform` the element already has.
 * The loop sleeps as soon as every spring has settled and the pointer is gone.
 */

export type Kind = "repel" | "attract" | "grow" | "drop" | "press" | "swing" | "ripple" | "explode" | "follow" | "heavy";
export type Axis = "x" | "y" | "z" | "s" | "r";
export type Vec = Record<Axis, number>;

/** Spring stiffness `k`, damping `c` and reach `R` (px around the pointer) per kind. */
export const KINDS: Record<Kind, { k: number; c: number; R: number }> = {
  repel: { k: 0.14, c: 0.7, R: 190 },
  attract: { k: 0.05, c: 0.86, R: 300 },
  grow: { k: 0.09, c: 0.76, R: 230 },
  drop: { k: 0.06, c: 0.8, R: 200 },
  press: { k: 0.28, c: 0.58, R: 0 },
  swing: { k: 0.018, c: 0.965, R: 210 },
  ripple: { k: 0.22, c: 0.62, R: 170 },
  explode: { k: 0.05, c: 0.84, R: 320 },
  follow: { k: 0.03, c: 0.9, R: 9999 },
  heavy: { k: 0.035, c: 0.92, R: 220 },
};

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smooth = (f: number): number => f * f * (3 - 2 * f);

export const rest = (): Vec => ({ x: 0, y: 0, z: 0, s: 1, r: 0 });

export type Input = {
  /** unit vector from the pointer to the element, and the strength 0..1 of the pointer's reach */
  ux: number;
  uy: number;
  f: number;
  /** pointer over the element / button held on it */
  hit: boolean;
  down: boolean;
  /** pointer-to-element offset, for `follow` */
  fx: number;
  fy: number;
  on: boolean;
  m: number;
  z0: number;
};

/** The pose an element is pulled towards while the pointer is where `Input` says. */
export function target(kind: Kind, i: Input): Vec {
  const t = rest();
  const { ux, uy, f, m } = i;
  switch (kind) {
    case "repel":
      t.x = ux * f * 80 * m;
      t.y = uy * f * 80 * m;
      t.z = f * 30;
      t.r = ux * f * 22 * m;
      break;
    case "attract":
      t.x = -ux * f * 50 * m;
      t.y = -uy * f * 50 * m;
      t.z = f * 20;
      t.s = 1 + f * 0.1;
      t.r = -ux * f * 18;
      break;
    case "grow":
      t.y = -f * 10;
      t.z = f * 70;
      t.s = 1 + f * 0.16;
      break;
    case "drop":
      t.x = ux * f * 24;
      t.r = ux * f * 10;
      break;
    case "press":
      t.z = i.down ? -14 : i.hit ? 16 : 0;
      t.s = i.down ? 0.95 : 1;
      break;
    case "ripple":
      t.z = f * 46;
      t.y = -f * 10;
      t.s = 1 + f * 0.15;
      break;
    case "explode":
      t.z = (i.z0 / 96) * f * 80;
      t.x = -(i.z0 / 96) * f * 34;
      break;
    case "follow":
      if (i.on) {
        t.x = clamp(i.fx * 0.5, -150, 150);
        t.y = clamp(i.fy * 0.5, -90, 90);
        t.r = t.x * 0.18;
      }
      break;
    case "heavy":
      t.x = ux * f * 14;
      t.y = uy * f * 6;
      t.r = ux * f * 5;
      break;
    case "swing":
      break;
  }
  return t;
}

/** One damped spring step; returns true while the axis is still moving. */
export function spring(p: Vec, v: Vec, t: Vec, axis: Axis, k: number, c: number): boolean {
  v[axis] += (t[axis] - p[axis]) * k;
  v[axis] *= c;
  p[axis] += v[axis];
  return Math.abs(v[axis]) > 0.01 || Math.abs(t[axis] - p[axis]) > 0.05;
}

/** The parcel falls back under gravity and bounces, squashing a little on every landing. Returns true while it moves. */
export function gravity(p: Vec, v: Vec): boolean {
  v.y += 1;
  p.y += v.y;
  if (p.y > 0) {
    const impact = v.y;
    p.y = 0;
    v.y = -impact * 0.45;
    if (Math.abs(v.y) < 1.2) v.y = 0;
    v.s -= Math.min(0.09, impact * 0.012);
  }
  return p.y < 0 || v.y !== 0;
}

/** Which page elements get which physics, by selector: data-driven so markup stays clean. First match wins. */
export const PHYS_MAP: ReadonlyArray<readonly [selector: string, kind: Kind]> = [
  [".notes .note", "repel"],
  [".stage .phone", "heavy"],
  [".btn, .visit", "press"],
  [".card, .item, .tile", "grow"],
];

/** Marks the page's elements with `data-phys` from `PHYS_MAP` and attaches the engine. */
export function attachPagePhysics(root: HTMLElement): () => void {
  for (const [selector, kind] of PHYS_MAP) {
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (!el.dataset.phys) el.dataset.phys = kind;
    });
  }
  return attachPhysics(root);
}

type Item = { el: HTMLElement; kind: Kind; m: number; z0: number; p: Vec; v: Vec; down: boolean; seen: boolean };

const AXES: Axis[] = ["x", "y", "z", "s", "r"];

function isKind(k: string | undefined): k is Kind {
  return !!k && k in KINDS;
}

/**
 * Wires every `[data-phys]` element under `root`. Does nothing for `prefers-reduced-motion`.
 * Elements outside the viewport are skipped. Returns a dispose function.
 */
export function attachPhysics(root: HTMLElement): () => void {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  const items: Item[] = [];
  root.querySelectorAll<HTMLElement>("[data-phys]").forEach((el) => {
    const kind = el.dataset.phys;
    if (!isKind(kind)) return;
    items.push({ el, kind, m: Number(el.dataset.m) || 1, z0: Number(el.dataset.z) || 0, p: rest(), v: { x: 0, y: 0, z: 0, s: 0, r: 0 }, down: false, seen: true });
  });
  if (!items.length) return () => {};

  const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((es) => es.forEach((e) => { const it = items.find((i) => i.el === e.target); if (it) it.seen = e.isIntersecting; }));
  items.forEach((i) => io?.observe(i.el));

  const st = { x: 0, y: 0, lx: 0, on: false, pvx: 0, raf: 0 };
  const wake = (): void => {
    if (!st.raf) st.raf = requestAnimationFrame(tick);
  };
  function tick(): void {
    st.raf = 0;
    let busy = st.on;
    st.pvx *= 0.82;
    for (const o of items) {
      if (!o.seen && !o.v.x && !o.v.y && !o.v.z && o.p.x === 0) continue;
      const K = KINDS[o.kind];
      const rc = o.el.getBoundingClientRect();
      // the rect includes the current offset; subtract it so the pointer distance is to the element's rest place
      const cx = rc.left + rc.width / 2 - o.p.x;
      const cy = rc.top + rc.height / 2 - o.p.y;
      const dx = cx - st.x;
      const dy = cy - st.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = smooth(st.on ? clamp(1 - d / K.R, 0, 1) : 0);
      const hit = st.on && st.x > rc.left && st.x < rc.right && st.y > rc.top && st.y < rc.bottom;
      const t = target(o.kind, { ux: dx / d, uy: dy / d, f, hit, down: o.down, fx: st.x - cx, fy: st.y - cy, on: st.on, m: o.m, z0: o.z0 });
      if (o.kind === "swing") o.v.r -= st.pvx * f * 0.04 * o.m;
      for (const a of AXES) {
        if (o.kind === "drop" && a === "y") continue;
        const squash = o.kind === "drop" && a === "s";
        if (spring(o.p, o.v, t, a, squash ? 0.2 : K.k, squash ? 0.6 : K.c)) busy = true;
      }
      if (o.kind === "drop" && gravity(o.p, o.v)) busy = true;
      const sx = o.kind === "drop" ? 1 + (1 - o.p.s) * 0.7 : o.p.s;
      o.el.style.translate = `${o.p.x.toFixed(1)}px ${o.p.y.toFixed(1)}px ${o.p.z.toFixed(1)}px`;
      o.el.style.rotate = `${o.p.r.toFixed(2)}deg`;
      o.el.style.scale = `${sx.toFixed(3)} ${o.p.s.toFixed(3)}`;
    }
    if (busy) wake();
  }

  const onMove = (e: PointerEvent): void => {
    st.pvx = clamp(e.clientX - st.lx, -40, 40);
    st.lx = e.clientX;
    st.x = e.clientX;
    st.y = e.clientY;
    st.on = true;
    wake();
  };
  const onLeave = (): void => {
    st.on = false;
    wake();
  };
  const onUp = (): void => {
    items.forEach((o) => (o.down = false));
    wake();
  };
  const onDown = (e: PointerEvent): void => {
    st.x = e.clientX;
    st.y = e.clientY;
    st.on = true;
    const target = e.target instanceof Node ? e.target : null;
    for (const o of items) {
      const rc = o.el.getBoundingClientRect();
      const cx = rc.left + rc.width / 2;
      const cy = rc.top + rc.height / 2;
      const d = Math.hypot(cx - e.clientX, cy - e.clientY);
      const inside = !!target && o.el.contains(target);
      if (o.kind === "drop" && inside) o.v.y = -13;
      if (o.kind === "press" && inside) o.down = true;
      if (o.kind === "swing" && (inside || d < 260)) o.v.r += (cx > e.clientX ? 1 : -1) * 9 * o.m;
      if (o.kind === "heavy" && inside) o.v.r += (cx > e.clientX ? 1 : -1) * 3;
      if (o.kind === "ripple")
        setTimeout(() => {
          o.v.z += 26;
          wake();
        }, d * 0.9);
    }
    wake();
  };
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  return () => {
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    io?.disconnect();
    if (st.raf) cancelAnimationFrame(st.raf);
    for (const o of items) {
      o.el.style.translate = "";
      o.el.style.rotate = "";
      o.el.style.scale = "";
    }
  };
}
