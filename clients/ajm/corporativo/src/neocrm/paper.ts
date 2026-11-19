// The living paper (CORE-215 rounds 7 to 11): the page's dot grid drawn on a canvas, so the dots can
// step away from the cursor and the parcel and carry waves, the 3D parcel itself on a second canvas
// (parcel3d.ts, loaded on demand), and on a third the stars, the handwritten count and the fan's wind.
// The rules are in trail.ts; this file only reads the page and draws.
// Decoration only: the canvases ignore the pointer and are hidden from screen readers (LivePaper.vue).
import { FLIGHT_MS, ROUTE_WIDE, STORY, clamp, eventLift, eventX, glide, launchAt, lerp, packAt, paperStrength, parcelSize, planRoute, pushAway, routeFraction, star, tileNudge, waitTop } from "./trail";
import type { Plan } from "./trail";
import type { Layout, Parcel3d, Shadow } from "./parcel3d";

export type PaperOptions = {
  /** the page column (.ncrm): its left padding is the gutter */
  root: HTMLElement;
  dots: HTMLCanvasElement;
  gl: HTMLCanvasElement;
  /** stars, the count and the wind: always in front of the page */
  fx: HTMLCanvasElement;
  /** tiles that make a little room when the parcel passes */
  tiles: string;
  /** the hero note the story starts from; `keep` when it stays where it is (a visit of the tidy day) */
  source(): { el: HTMLElement; keep: boolean } | null;
  /** the two sections where the fan and the stamp stand */
  packing: string;
  /** tiles whose top edge makes the parcel hop */
  bounce: string;
  /** the section whose steps the parcel hops along */
  launch: string;
  /** the launch step that is lit */
  step(): { el: HTMLElement; n: number; of: number } | null;
  /** the parcel has to be drawn above the page: on a phone's margin, across the page, and for the plane's flight */
  over(on: boolean): void;
  /** the plane is on the demo button */
  land(on: boolean): void;
  /** no canvas or no WebGL after all: the caller falls back to the flat object */
  fail(): void;
};

const GRID = 22;
const OFF = 1.5;
/** Points of the packing where the paper gets a ripple: each note lands, the box shuts, the tape, the string, the stamp. */
const BEATS = [...STORY.pickups, 0.455, 0.585, 0.7, STORY.stamp];
/** The parcel takes this long to turn into the plane. */
const MORPH_MS = 1400;
/** ...and this long to get onto the launch steps, and from one step to the next. */
const HOP_MS = 420;
const STEP_MS = 480;

type Ripple = { x: number; y: number; amp: number; speed: number; life: number; t0: number };
type Tile = { el: HTMLElement; x: number; y: number; w: number; h: number; nx: number; ny: number };
/** `held` bursts stay where they are in the window (the launch steps are pinned while the page scrolls). */
type Burst = { x: number; y: number; t0: number; n: number; label: string; held: boolean };
type Wind = { x: number; y: number; dir: number; power: number };

const NO_PLAN: Plan = { route: { x0: 0, events: [] }, anchors: { fan: 0.3, stamp: 0.6, pad: 0.05 }, fan: { x: 0, y: 0, dir: 1 } };

export function startPaper(o: PaperOptions): () => void {
  const found = o.dots.getContext("2d");
  if (!found) {
    o.fail();
    return () => {};
  }
  const ctx: CanvasRenderingContext2D = found;
  const fx = o.fx.getContext("2d");
  const doc = document.documentElement;
  let stopped = false;
  let gl: Parcel3d | null = null;

  // ---------- what the page looks like right now ----------
  let layout: Layout = { width: 1, height: 1, size: 48, gutter: 16, start: 0, end: 0, ...NO_PLAN, note: { w: 0, h: 0, tilt: 0, keep: true }, landX: 0, landY: 0, bandTop: 0 };
  let range = 0;
  let wait = 0;
  let launchTop = 1;
  let heroBottom = 0;
  let wide = false;
  let tiles: Tile[] = [];
  let src: ReturnType<PaperOptions["source"]> = null;
  let hidden: HTMLElement | null = null;
  let launchEl: HTMLElement | null = null;
  let dirty = true;
  function show() {
    if (hidden) hidden.style.opacity = "";
    hidden = null;
  }
  function measure() {
    const width = doc.clientWidth;
    const height = window.innerHeight;
    const top = window.scrollY;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const canvas of [o.dots, o.fx]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gutter = parseFloat(getComputedStyle(o.root).paddingLeft) || 16;
    const size = parcelSize(width, gutter);
    range = Math.max(0, doc.scrollHeight - height);
    wide = width >= ROUTE_WIDE;
    const pageY = (el: Element) => el.getBoundingClientRect().top + top;

    // the story starts from a note of the hero drawing
    const next = o.source();
    if (next?.el !== src?.el) show();
    src = next;
    const sr = src?.el.getBoundingClientRect();
    const seen = sr && sr.width > 0 ? sr : null;
    const start = seen ? seen.top + top + seen.height / 2 : height * 0.45;
    const transform = src && seen ? getComputedStyle(src.el).transform.match(/matrix\(([^,]+),([^,]+)/) : null;
    const hero = src?.el.closest(".stage")?.getBoundingClientRect();
    // down to the first section the parcel is drawn in front of the page: it comes off the hero drawing
    const first = o.root.querySelector(".sec");
    heroBottom = first ? pageY(first) : hero ? hero.bottom + top : start + 200;

    const demo = document.getElementById("demo");
    const before = demo?.previousElementSibling;
    const demoTop = demo ? pageY(demo) : doc.scrollHeight - height * 0.5;
    const end = Math.max(start + 1, before ? (before.getBoundingClientRect().bottom + top + demoTop) / 2 - 8 : demoTop - 24);
    const button = demo?.querySelector(".btn--warm")?.getBoundingClientRect();

    // the free strip between a section's heading and its body, where the page has two columns
    let channel = NaN;
    let gap = 0;
    for (const sec of o.root.querySelectorAll(".sec")) {
      const head = sec.querySelector(".sec__head")?.getBoundingClientRect();
      const body = sec.querySelector(".sec__body")?.getBoundingClientRect();
      if (!head || !body || body.left < head.right + 8) continue;
      channel = (head.right + body.left) / 2;
      gap = body.left - head.right;
      break;
    }
    const [fanY = NaN, stampY = NaN] = [...o.root.querySelectorAll(o.packing)].map(pageY);
    const plan = planRoute({ width, gutter, x0: seen ? seen.left + seen.width / 2 : width / 2, start, end, channel, gap, fanY, stampY, edges: [...o.root.querySelectorAll(o.bounce)].map(pageY) });
    layout = {
      width,
      height,
      size,
      gutter,
      start,
      end,
      ...plan,
      note: {
        w: src && seen ? src.el.offsetWidth : 0,
        h: src && seen ? src.el.offsetHeight : 0,
        tilt: transform ? Math.atan2(parseFloat(transform[2] ?? "0"), parseFloat(transform[1] ?? "1")) : 0,
        keep: !src || !seen || src.keep,
      },
      landX: button ? button.right - 8 : width / 2,
      landY: button ? button.top + top + 4 : demoTop + 40,
      bandTop: demoTop,
    };
    wait = waitTop(start, height);
    launchTop = launchAt(end, range, height) * range;
    launchEl = o.root.querySelector<HTMLElement>(o.launch);
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

  // ---------- ripples and star bursts, in page coordinates ----------
  const ripples: Ripple[] = [];
  function ripple(x: number, y: number, amp: number, speed = 260, life = 1.2) {
    ripples.push({ x, y, amp, speed, life, t0: performance.now() });
    if (ripples.length > 16) ripples.shift();
  }
  const bursts: Burst[] = [];
  function burst(x: number, y: number, n: number, label = "", held = false) {
    bursts.push({ x, y, t0: performance.now(), n, label, held });
    if (bursts.length > 8) bursts.shift();
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
  let colors = { dot: "#dccfb2", strong: "#b39c68", shade: "#3c2d0a", warm: "#f2b84b", ink: "#2a2412", primary: "#0b6b62", bg: "#f7f1e3", hand: "cursive" };
  let colorAge = 99;
  function drawPaper(c: CanvasRenderingContext2D, now: number, top: number, S: number, wave: number, ox: number, oy: number, wind: Wind, shadows: Shadow[]) {
    if (++colorAge > 30) {
      const cs = getComputedStyle(doc);
      const tok = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
      colors = {
        dot: tok("--ncrm-dot", colors.dot),
        strong: tok("--ncrm-dot-strong", colors.strong),
        shade: tok("--ncrm-shade", colors.shade),
        warm: tok("--ncrm-warm", colors.warm),
        ink: tok("--ncrm-note-ink", colors.ink),
        primary: tok("--ncrm-primary", colors.primary),
        bg: tok("--ncrm-bg", colors.bg),
        hand: tok("--ncrm-hand", colors.hand),
      };
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
        // the fan's wind runs along the dots in front of it
        if (wind.power > 0.02 && Math.abs(wy - wind.y) < 110 && (wx - wind.x) * wind.dir > 0) {
          dx += wind.dir * wind.power * 7 * (1 - Math.abs(wy - wind.y) / 110) * (0.6 + 0.4 * Math.sin(wx * 0.05 * wind.dir - t * 11));
        }
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

  // ---------- in front of the page: stars, the handwritten count, the wind ----------
  let fxUsed = false;
  function drawFx(c: CanvasRenderingContext2D, now: number, top: number, wind: Wind) {
    const { width, height, size } = layout;
    if (fxUsed) c.clearRect(0, 0, width, height);
    fxUsed = bursts.length > 0 || wind.power > 0.02;
    if (!fxUsed) return;
    c.lineJoin = "round";
    c.lineCap = "round";
    for (const b of bursts) {
      const age = (now - b.t0) / 1000;
      const by = b.held ? b.y : b.y - top;
      for (let i = 0; i < b.n; i++) {
        const s = star(age, i, b.n);
        if (s.alpha <= 0) continue;
        const r = size * 0.11 * s.scale;
        c.save();
        c.translate(b.x + s.x, by + s.y);
        c.rotate(s.spin);
        c.globalAlpha = s.alpha;
        c.beginPath();
        for (let p = 0; p < 10; p++) {
          const a = (p / 10) * 6.2832 - Math.PI / 2;
          const d = p % 2 ? r * 0.45 : r;
          c.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        }
        c.closePath();
        c.fillStyle = colors.warm;
        c.fill();
        c.lineWidth = 1.4;
        c.strokeStyle = colors.ink;
        c.stroke();
        c.restore();
      }
      if (!b.label) continue;
      // the count, written by hand next to the box
      const pop = 1 + 0.35 * Math.sin(Math.PI * clamp(age / 0.3));
      c.save();
      // towards the nearer window edge, where the margin is free paper and the text and tiles are not
      c.translate(Math.min(Math.max(b.x + size * (b.x > width / 2 ? 0.75 : -0.75), size * 0.4), width - size * 0.4), by - size * 0.2 - 30 * age);
      c.rotate(-0.1);
      c.globalAlpha = clamp((1.3 - age) / 0.4);
      c.font = `600 ${Math.round(size * 0.62 * pop)}px ${colors.hand}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 5;
      c.strokeStyle = colors.bg;
      c.strokeText(b.label, 0, 0);
      c.fillStyle = colors.primary;
      c.fillText(b.label, 0, 0);
      c.restore();
    }
    if (wind.power > 0.02) {
      const reach = Math.min(width * 0.6, 620);
      c.strokeStyle = colors.strong;
      c.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const ph = (now / 620 + i / 7) % 1;
        const x = wind.x + wind.dir * (size * 0.5 + ph * reach);
        const y = wind.y - top + (i - 3) * size * 0.2 + Math.sin(ph * 6 + i) * 6;
        c.globalAlpha = wind.power * Math.sin(Math.PI * ph) * 0.75;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + wind.dir * 14, y - 4, x + wind.dir * (16 + 22 * (1 - ph)), y);
        c.stroke();
      }
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
  let fs = -1;
  let prevG = 0;
  let prevYs = 0;
  let wave = 0;
  let sway = 0;
  let morph = 0;
  let fly = 0;
  let landed = false;
  let isOver = false;
  let alive = false;
  let tokenAge = 0;
  // the hop onto the launch steps: how far on (0..1), where to, which step, when it last jumped
  const hop = { on: 0, x: 0, y: 0, n: -1, t0: -1e9, star: 0 };
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(64, now - last);
    last = now;
    const { height, size, start, end, route } = layout;
    const top = window.scrollY;
    const f = routeFraction(top, wait, launchTop);
    if (fs < 0) fs = f;
    const scrolled = top !== lastTop;
    const vel = ((top - lastTop) / dt) * 16;
    lastTop = top;

    // packing follows the scroll softly, so a mouse wheel's steps do not show (round 10)
    const wasFs = fs;
    fs += (f - fs) * (1 - Math.exp(-dt / 140));
    if (Math.abs(f - fs) < 0.0002) fs = f;
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
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      if (b && (now - b.t0) / 1000 >= 1.4) bursts.splice(i, 1);
    }

    // the parcel keeps its height in the window exactly; its packing and what the page's events do to it are eased
    const ys = lerp(start, end, fs);
    const g = packAt(fs, layout.anchors);
    let x = eventX(ys, route);
    let y = lerp(start, end, f);
    let lift = eventLift(ys, route);
    const gust = Math.sin(Math.PI * clamp((g - STORY.gust[0]) / (STORY.gust[1] - STORY.gust[0])));
    const wind: Wind = { x: layout.fan.x, y: layout.fan.y, dir: layout.fan.dir, power: gl ? gust : 0 };
    const crossing = route.events.some((e) => e.kind !== "bounce" && ys > e.at && ys < e.at + e.span);

    // the plane runs on time: it opens once the parcel has arrived, and flies when the button is in the window
    const arrived = f >= 1 && fs > 0.999;
    const buttonSeen = layout.landY < top + height - 60 || top >= range - 2;
    const wasMorph = morph;
    const wasFly = fly;
    fly = glide(fly, arrived && morph >= 1 && buttonSeen ? 1 : 0, dt, arrived ? FLIGHT_MS : FLIGHT_MS / 3);
    morph = glide(morph, arrived || fly > 0 ? 1 : 0, dt, MORPH_MS);
    if (landed !== fly >= 1) {
      landed = !landed;
      o.land(landed);
      if (landed) {
        ripple(layout.landX, layout.landY, 7, 240, 1.3);
        burst(layout.landX, layout.landY, 7);
      }
    }

    // on a computer the sealed parcel hops onto the launch step that is lit, and on to the next with the scroll
    let steps = 0;
    let onSteps = false;
    const section = launchEl?.getBoundingClientRect();
    if (section && section.top < height * 0.75) {
      const lit = o.step();
      steps = lit ? lit.n + 1 : 0;
      if (lit && wide && gl && morph === 0 && section.top < height * 0.5 && section.bottom > height * 0.5) {
        const num = lit.el.getBoundingClientRect();
        const tx = num.left + num.width / 2;
        const ty = num.top + top - size * 0.4;
        if (hop.on <= 0) {
          hop.x = tx;
          hop.y = ty;
        } else if (lit.n !== hop.n) {
          hop.t0 = now;
          hop.star = now + STEP_MS * 0.9;
        }
        hop.n = lit.n;
        const kh = 1 - Math.exp(-dt / 110);
        hop.x += (tx - hop.x) * kh;
        hop.y += (ty - hop.y) * kh;
        onSteps = true;
      }
    }
    const wasHop = hop.on;
    hop.on = glide(hop.on, onSteps ? 1 : 0, dt, HOP_MS);
    const jump = Math.sin(Math.PI * clamp((now - hop.t0) / STEP_MS));
    if (hop.on > 0) {
      const e = hop.on * hop.on * (3 - 2 * hop.on);
      x = lerp(x, hop.x, e);
      y = lerp(y, hop.y, e);
      lift += (Math.sin(Math.PI * hop.on) + jump) * size * 0.8;
    }
    if (hop.star && now >= hop.star) {
      hop.star = 0;
      if (hop.on > 0.5) {
        burst(hop.x, hop.y - top, 5, "", true);
        ripple(hop.x, hop.y + size * 0.4, 4, 240, 1.1);
      }
    }

    const over = !wide || morph > 0 || hop.on > 0.01 || crossing || y < heroBottom;
    if (over !== isOver) {
      isOver = over;
      o.over(over);
    }
    // the hero note itself has left: the 3D one is drawn in its place
    const taken = f > 0 && !!gl && !!src && !layout.note.keep;
    if (taken !== !!hidden) {
      show();
      if (taken && src) {
        hidden = src.el;
        hidden.style.opacity = "0";
      }
    }

    if (gl) {
      for (const b of BEATS) if ((prevG < b && g >= b) || (prevG > b && g <= b)) ripple(x, y, 4.5, 240, 1.3);
      // a note lands in the box: stars, and the count written next to it
      STORY.pickups.forEach((at, i) => {
        if (prevG < at && g >= at) burst(x, y - size * 0.3, 7, `${i + 1}/${STORY.pickups.length}`);
      });
      if (prevG < STORY.stamp && g >= STORY.stamp) burst(x, y - size * 0.2, 6);
      for (const e of route.events) {
        if (e.kind === "bounce" && ((prevYs < e.at && ys >= e.at) || (prevYs > e.at && ys <= e.at))) ripple(x, e.at, 5, 250, 1.2);
      }
    }
    prevG = g;
    prevYs = ys;

    const busy =
      dirty ||
      scrolled ||
      alive ||
      fs !== wasFs ||
      wave > 0.02 ||
      Math.abs(sway) > 0.002 ||
      ripples.length > 0 ||
      bursts.length > 0 ||
      fxUsed ||
      gust > 0.02 ||
      Math.abs(ptr.target - ptr.on) > 0.01 ||
      (ptr.on > 0.01 && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 0.3) ||
      morph !== wasMorph ||
      fly !== wasFly ||
      hop.on !== wasHop ||
      hop.on > 0 ||
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
      const posed = gl.pose({ g, f, morph, fly, x, y, lift, gust, steps, top, sway, ptr: { x: ptr.sx, y: ptr.sy, on: ptr.on }, now });
      shadows = posed.shadows;
      alive = posed.alive;
      gl.render(top);
    }
    // in the hero it is still a note, and once it is a plane it no longer parts the dots or moves the tiles
    const solid = !!gl && f > 0 && morph < 0.5;
    drawPaper(ctx, now, top, S, wave, solid ? x : -999, y, wind, shadows);
    if (fx) drawFx(fx, now, top, wind);
    nudgeTiles(x, y, solid && hop.on < 0.5 ? S : 0);
  }

  // ---------- go ----------
  const remeasure = () => measure();
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null;
  const themed = new MutationObserver(() => {
    colorAge = 99;
    tokenAge = 99;
    dirty = true;
  });
  // "tidy my day" files the loose notes: the story then starts from the day's last visit, once it has settled
  let settle = 0;
  const tidied = new MutationObserver(() => {
    show();
    measure();
    window.clearTimeout(settle);
    settle = window.setTimeout(() => !stopped && measure(), 700);
  });
  measure();
  window.addEventListener("resize", remeasure);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  doc.addEventListener("pointerleave", onLeave);
  observer?.observe(o.root);
  themed.observe(doc, { attributes: true, attributeFilter: ["data-theme"] });
  const stage = o.root.querySelector(".stage");
  if (stage) tidied.observe(stage, { attributes: true, attributeFilter: ["class"] });
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
    window.clearTimeout(settle);
    window.removeEventListener("resize", remeasure);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    doc.removeEventListener("pointerleave", onLeave);
    observer?.disconnect();
    themed.disconnect();
    tidied.disconnect();
    show();
    for (const t of tiles) t.el.style.translate = "";
    gl?.dispose();
    gl = null;
  };
}
