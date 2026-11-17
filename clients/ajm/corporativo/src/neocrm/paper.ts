// The living paper (CORE-215 rounds 7 to 10): the page's dot grid drawn on a canvas, so the dots can
// step away from the cursor and the parcel and carry waves, plus the 3D parcel itself on a second canvas
// (parcel3d.ts, loaded on demand). The rules are in trail.ts; this file only reads the page and draws.
// Decoration only: both canvases ignore the pointer and are hidden from screen readers (LivePaper.vue).
import { FLIGHT_MS, LAUNCH, ROUTE_WIDE, clamp, glide, launchAt, lerp, paperStrength, parcelSize, pushAway, routeShape, routeX, tileNudge, timeline, tipS } from "./trail";
import type { Layout, Parcel3d, Shadow } from "./parcel3d";

export type PaperOptions = {
  /** the page column (.ncrm): its left padding is the gutter */
  root: HTMLElement;
  dots: HTMLCanvasElement;
  gl: HTMLCanvasElement;
  /** tiles that make a little room when the parcel passes */
  tiles: string;
  /** the parcel has to be drawn above the page: on a phone's margin, and for the plane's flight */
  over(on: boolean): void;
  /** the plane is on the demo button */
  land(on: boolean): void;
  /** no canvas or no WebGL after all: the caller falls back to the flat object */
  fail(): void;
};

const GRID = 22;
const OFF = 1.5;
/** Points of the packing where the paper gets a ripple: a note lands, the box shuts, the tape, the stamp. */
const BEATS = [0.222, 0.292, 0.455, 0.585, 0.7, 0.83];
/** The parcel takes this long to turn into the plane. */
const MORPH_MS = 1400;

type Ripple = { x: number; y: number; amp: number; speed: number; life: number; t0: number };
type Tile = { el: HTMLElement; x: number; y: number; w: number; h: number; nx: number; ny: number };

export function startPaper(o: PaperOptions): () => void {
  const found = o.dots.getContext("2d");
  if (!found) {
    o.fail();
    return () => {};
  }
  const ctx: CanvasRenderingContext2D = found;
  const doc = document.documentElement;
  let stopped = false;
  let gl: Parcel3d | null = null;

  // ---------- what the page looks like right now ----------
  let layout: Layout = { width: 1, height: 1, size: 48, gutter: 16, start: 0, end: 0, shape: { cx: 0, amp: 0, wave: 90 }, landX: 0, landY: 0, bandTop: 0 };
  let range = 0;
  let launch = 0.97;
  let wide = false;
  let tiles: Tile[] = [];
  let dirty = true;
  function measure() {
    const width = doc.clientWidth;
    const height = window.innerHeight;
    const top = window.scrollY;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    o.dots.width = Math.round(width * dpr);
    o.dots.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gutter = parseFloat(getComputedStyle(o.root).paddingLeft) || 16;
    range = Math.max(0, doc.scrollHeight - height);
    wide = width >= ROUTE_WIDE;
    const start = height * 0.45;
    const demo = document.getElementById("demo");
    const before = demo?.previousElementSibling;
    const demoTop = demo ? demo.getBoundingClientRect().top + top : doc.scrollHeight - height * 0.5;
    const end = Math.max(start + 1, before ? (before.getBoundingClientRect().bottom + top + demoTop) / 2 - 8 : demoTop - 24);
    const button = demo?.querySelector(".btn--warm")?.getBoundingClientRect();
    layout = {
      width,
      height,
      size: parcelSize(width, gutter),
      gutter,
      start,
      end,
      shape: routeShape(width, gutter),
      landX: button ? button.right - 8 : width / 2,
      landY: button ? button.top + top + 4 : demoTop + 40,
      bandTop: demoTop,
    };
    launch = launchAt(end, range, height);
    for (const t of tiles) t.el.style.translate = "";
    tiles = wide
      ? [...o.root.querySelectorAll<HTMLElement>(o.tiles)].map((el) => {
          const r = el.getBoundingClientRect();
          return { el, x: r.left, y: r.top + top, w: r.width, h: r.height, nx: 0, ny: 0 };
        })
      : [];
    gl?.resize(layout);
    dirty = true;
  }

  // ---------- ripples, in page coordinates ----------
  const ripples: Ripple[] = [];
  function ripple(x: number, y: number, amp: number, speed = 260, life = 1.2) {
    ripples.push({ x, y, amp, speed, life, t0: performance.now() });
    if (ripples.length > 16) ripples.shift();
  }

  // ---------- pointer, in window coordinates; a finger scrolls, it does not play ----------
  const ptr = { x: 0, y: 0, sx: 0, sy: 0, on: 0, target: 0, lastX: 0, lastY: 0, travel: 0 };
  function onMove(e: PointerEvent) {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (!ptr.target) {
      ptr.sx = ptr.lastX = ptr.x;
      ptr.sy = ptr.lastY = ptr.y;
    }
    ptr.target = e.pointerType === "touch" ? 0 : 1;
    ptr.travel += Math.hypot(ptr.x - ptr.lastX, ptr.y - ptr.lastY);
    ptr.lastX = ptr.x;
    ptr.lastY = ptr.y;
    if (ptr.travel > 110) {
      ptr.travel = 0;
      if (ptr.target) ripple(ptr.x, ptr.y + window.scrollY, 3.2, 230, 1.1);
    }
  }
  const onLeave = () => {
    ptr.target = 0;
  };
  const onDown = (e: PointerEvent) => ripple(e.clientX, e.clientY + window.scrollY, 7, 300, 1.6);

  // ---------- the paper: dots and flat shadows; the parcel's route is never drawn ----------
  let colors = { dot: "#dccfb2", strong: "#b39c68", shade: "#3c2d0a" };
  let colorAge = 99;
  function drawPaper(c: CanvasRenderingContext2D, now: number, top: number, S: number, wave: number, ox: number, oy: number, shadows: Shadow[]) {
    if (++colorAge > 30) {
      const cs = getComputedStyle(doc);
      const tok = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
      colors = { dot: tok("--ncrm-dot", colors.dot), strong: tok("--ncrm-dot-strong", colors.strong), shade: tok("--ncrm-shade", colors.shade) };
      colorAge = 0;
    }
    const { width, height } = layout;
    c.clearRect(0, 0, width, height);
    const t = now / 1000;
    const px = ptr.sx;
    const py = ptr.sy + top;
    const R = 130;
    const strong: number[] = [];
    const j0 = Math.floor(top / GRID) - 1;
    const j1 = Math.ceil((top + height) / GRID) + 1;
    const i1 = Math.ceil(width / GRID) + 1;
    c.fillStyle = colors.dot;
    c.beginPath();
    for (let j = j0; j <= j1; j++) {
      for (let i = -1; i <= i1; i++) {
        const wx = i * GRID + OFF;
        const wy = j * GRID + OFF;
        let dx = 0;
        let dy = 0;
        if (ptr.on > 0.01 && Math.abs(wx - px) < R && Math.abs(wy - py) < R) {
          const push = pushAway(wx - px, wy - py, R, 10 * S * ptr.on);
          dx += push.x;
          dy += push.y;
        }
        if (Math.abs(wx - ox) < 70 && Math.abs(wy - oy) < 70) {
          const push = pushAway(wx - ox, wy - oy, 70, 6 * S);
          dx += push.x;
          dy += push.y;
        }
        for (const r of ripples) {
          const age = (now - r.t0) / 1000;
          if (age >= r.life) continue;
          const ex = wx - r.x;
          const ey = wy - r.y;
          const d = Math.sqrt(ex * ex + ey * ey) || 1;
          const ph = d - r.speed * age;
          if (ph > 46 || ph < -46) continue;
          const cos = Math.cos((ph / 46) * (Math.PI / 2));
          const m = r.amp * S * Math.pow(1 - age / r.life, 2) * cos * cos;
          dx += (ex / d) * m;
          dy += (ey / d) * m;
        }
        if (wave > 0.02) dx += wave * S * Math.sin(wy * 0.021 - t * 5);
        const inf = clamp(Math.hypot(dx, dy) / 6);
        const x = wx + dx;
        const y = wy + dy - top;
        const rr = 1 + inf * 0.9;
        if (inf > 0.35) {
          strong.push(x, y, rr);
          continue;
        }
        c.moveTo(x + rr, y);
        c.arc(x, y, rr, 0, 6.2832);
      }
    }
    c.fill();
    c.fillStyle = colors.strong;
    c.beginPath();
    for (let n = 0; n + 2 < strong.length; n += 3) {
      const x = strong[n] ?? 0;
      const y = strong[n + 1] ?? 0;
      const rr = strong[n + 2] ?? 1;
      c.moveTo(x + rr, y);
      c.arc(x, y, rr, 0, 6.2832);
    }
    c.fill();

    // flat shadows: the higher the thing, the further its shadow
    c.fillStyle = colors.shade;
    for (const s of shadows) {
      c.globalAlpha = s.a;
      c.beginPath();
      c.ellipse(s.x, s.y - top, s.rx, s.ry, 0, 0, 6.2832);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  /** Tiles near the parcel step aside by a few pixels and come back when it has passed. */
  function nudgeTiles(x: number, y: number, strength: number) {
    for (const t of tiles) {
      const near = strength > 0 && Math.abs(t.y + t.h / 2 - y) < t.h / 2 + 200;
      const want = near ? tileNudge(x, y, t, strength) : { x: 0, y: 0 };
      if (!near && !t.nx && !t.ny) continue;
      t.nx += (want.x - t.nx) * 0.14;
      t.ny += (want.y - t.ny) * 0.14;
      if (Math.abs(t.nx) < 0.05 && Math.abs(t.ny) < 0.05 && !want.x && !want.y) t.nx = t.ny = 0;
      t.el.style.translate = t.nx || t.ny ? `${t.nx.toFixed(2)}px ${t.ny.toFixed(2)}px` : "";
    }
  }

  // ---------- frame ----------
  let raf = 0;
  let last = performance.now();
  let lastTop = window.scrollY;
  let gs = -1;
  let prevQ = 0;
  let wave = 0;
  let sway = 0;
  let morph = 0;
  let fly = 0;
  let landed = false;
  let isOver = false;
  let alive = false;
  let tokenAge = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(64, now - last);
    last = now;
    const { height } = layout;
    const top = window.scrollY;
    const g = range > 0 ? clamp(top / range) : 0;
    if (gs < 0) gs = g;
    const scrolled = top !== lastTop;
    const vel = ((top - lastTop) / dt) * 16;
    lastTop = top;

    // packing follows the scroll softly, so a mouse wheel's steps do not show (round 10)
    gs += (g - gs) * (1 - Math.exp(-dt / 140));
    if (Math.abs(g - gs) < 0.0002) gs = g;
    const want = clamp(Math.abs(vel) * 0.3, 0, 5);
    wave += (want - wave) * (want > wave ? 0.2 : 0.06);
    sway += (clamp(vel * 0.012, -0.22, 0.22) - sway) * 0.1;
    ptr.on += (ptr.target - ptr.on) * 0.12;
    const kp = 1 - Math.exp(-dt / 70);
    ptr.sx += (ptr.x - ptr.sx) * kp;
    ptr.sy += (ptr.y - ptr.sy) * kp;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      if (r && (now - r.t0) / 1000 >= r.life) ripples.splice(i, 1);
    }

    // the parcel keeps its height in the window exactly; only its sideways swing and its packing are eased
    const q = timeline(gs, launch);
    const y = tipS(timeline(g, launch), layout.start, layout.end);
    const x = routeX(tipS(q, layout.start, layout.end) - layout.start, layout.shape, layout.gutter);

    // the plane runs on time: it opens once the parcel has arrived, and flies when the button is in the window
    const arrived = q >= LAUNCH;
    const buttonSeen = layout.landY < top + height - 60 || g >= 0.995;
    const wasMorph = morph;
    const wasFly = fly;
    fly = glide(fly, arrived && morph >= 1 && buttonSeen ? 1 : 0, dt, arrived ? FLIGHT_MS : FLIGHT_MS / 3);
    morph = glide(morph, arrived || fly > 0 ? 1 : 0, dt, MORPH_MS);
    if (landed !== fly >= 1) {
      landed = !landed;
      o.land(landed);
      if (landed) ripple(layout.landX, layout.landY, 7, 240, 1.3);
    }
    const over = !wide || morph > 0;
    if (over !== isOver) {
      isOver = over;
      o.over(over);
    }
    for (const b of BEATS) if ((prevQ < b && q >= b) || (prevQ > b && q <= b)) ripple(x, y, 4.5, 240, 1.3);
    prevQ = q;

    const busy =
      dirty ||
      scrolled ||
      alive ||
      gs !== g ||
      wave > 0.02 ||
      Math.abs(sway) > 0.002 ||
      ripples.length > 0 ||
      Math.abs(ptr.target - ptr.on) > 0.01 ||
      (ptr.on > 0.01 && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 0.3) ||
      morph !== wasMorph ||
      fly !== wasFly ||
      tiles.some((t) => t.nx || t.ny);
    if (!busy) return;
    dirty = false;

    const S = paperStrength(top, height);
    let shadows: Shadow[] = [];
    alive = false;
    if (gl) {
      if (++tokenAge > 60) {
        gl.tokens();
        tokenAge = 0;
      }
      const posed = gl.pose({ q, morph, fly, x, y, top, sway, ptr: { x: ptr.sx, y: ptr.sy, on: ptr.on }, now });
      shadows = posed.shadows;
      alive = posed.alive;
      gl.render(top);
    }
    // once it is a plane, the parcel no longer parts the dots or moves the tiles
    drawPaper(ctx, now, top, S, wave, gl && morph < 0.5 ? x : -999, y, shadows);
    nudgeTiles(x, y, gl && morph < 0.5 ? S : 0);
  }

  // ---------- go ----------
  const remeasure = () => measure();
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null;
  const themed = new MutationObserver(() => {
    colorAge = 99;
    tokenAge = 99;
    dirty = true;
  });
  measure();
  window.addEventListener("resize", remeasure);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  doc.addEventListener("pointerleave", onLeave);
  observer?.observe(o.root);
  themed.observe(doc, { attributes: true, attributeFilter: ["data-theme"] });
  void document.fonts?.ready.then(() => !stopped && measure());
  raf = requestAnimationFrame(frame);

  import("./parcel3d")
    .then((m) => {
      if (stopped) return;
      gl = m.buildParcel(o.gl);
      gl.resize(layout);
      dirty = true;
    })
    .catch(() => {
      if (!stopped) o.fail();
    });

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", remeasure);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    doc.removeEventListener("pointerleave", onLeave);
    observer?.disconnect();
    themed.disconnect();
    for (const t of tiles) t.el.style.translate = "";
    gl?.dispose();
    gl = null;
  };
}
