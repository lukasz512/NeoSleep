<template>
  <canvas ref="canvasEl" class="auth-dot-grid" aria-hidden="true" />
</template>

<script setup lang="ts">
// Plain rectangular dot grid. Each dot is its own tiny spring-damper system
// pinned to its grid "home" position; the pointer pushes dots away (no
// tangential/orbit force, so nothing spins — straight radial repulsion) and
// the spring pulls them back home the moment it lets go. Size and color both
// track live proximity to the pointer (see draw()'s proximity factor) — a
// dot lights up and grows the moment the cursor is close, not only once the
// spring has caught up.
// On top of that (NEO-103, see authDotChoreography.ts):
//   - the whole grid undulates like a slow-wave (delta) EEG trace, its
//     brighter crest drifting left → right, independent of the pointer;
//   - while `busy` (a sign-in in flight) the card "inhales" the dots — they are
//     drawn toward it, nearest first, glowing as they shrink away — and on an
//     error (busy drops without the view leaving) it breathes them back out.
// Real per-frame force/color accumulation (not eased/interpolated appearance
// values) is what keeps this from ever popping or jumping between states.
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { brandColors } from "@brand/colors";
import {
  advanceWavePhase,
  deltaWave,
  dotVisibility,
  inhaleLook,
  inhaleOrder,
  type InhaleMode,
} from "../composables/authDotChoreography";

const {
  dark = false,
  busy = false,
  anchor = null,
} = defineProps<{
  dark?: boolean;
  /** A sign-in (or other auth request) is in flight — the card inhales the dots. */
  busy?: boolean;
  /** The card the dots are inhaled into; without it they gather at the viewport center. */
  anchor?: HTMLElement | null;
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);

// Spacing between grid cells, in px — sparse on purpose (NEO-103): each dot
// reads as a single measurement point on the wave rather than as a texture.
const GRID_SPACING = 40;

const DOT_RADIUS = 1.8;
const DOT_RADIUS_PEAK = 4.5;
// Always-visible at rest ("kratka zawsze widoczna") — this is the resting
// opacity, not a near-zero value waiting for interaction to reveal it.
const BASE_OPACITY = 0.32;
const PEAK_OPACITY = 0.85;
// Opacity at the very top of the wave crest (no pointer nearby).
const CREST_OPACITY = 0.8;

// --- Physics (per dot, mass = 1, frame-coupled — see tick()) ---------------
// Spring pulling each dot back to its grid home position.
const SPRING = 0.055;
// Velocity retained per frame (1 - FRICTION lost) — damping, so the spring
// settles smoothly instead of oscillating/bouncing back and forth forever.
const FRICTION = 0.86;
// Radius (px) of the pointer's push field.
const INFLUENCE_RADIUS = 170;
// Peak radial push right at the pointer, falling off to 0 at
// INFLUENCE_RADIUS — straight repulsion only, no tangential/orbit term:
// dots move away from the pointer and spring straight back, they don't swirl.
const REPEL_STRENGTH = 2.6;
const MAX_FRAME_DELTA = 100;

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerpChannel(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Three-color blend per dot: resting brand tone <-> white (wave crest, and
// the glow while being inhaled) <-> deepened/brightened peak tone (pointer
// proximity, see draw()'s `pulled`).
const baseRgb = computed(() => hexToRgb(dark ? brandColors.primaryOnDark : brandColors.primary));
const crestRgb = computed(() => hexToRgb(brandColors.white));
const peakRgb = computed(() => hexToRgb(dark ? brandColors.white : brandColors.primaryDark));

interface Dot {
  homeX: number;
  homeY: number;
  row: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Random 0..1, fixed per dot — jitters the inhale order. */
  jitter: number;
  /** 1 = fully shown, 0 = inhaled by the card. */
  visibility: number;
  /** Visibility when the current inhale/exhale began (the tween's origin). */
  startVisibility: number;
  // Inhale geometry, recomputed each time an inhale/exhale starts.
  toCardX: number;
  toCardY: number;
  distanceToCard: number;
  order: number;
}

let ctx: CanvasRenderingContext2D | null = null;
let dpr = 1;
let cssWidth = 0;
let cssHeight = 0;
let dots: Dot[] = [];

let pointerX = 0;
let pointerY = 0;
let pointerActive = false;

let rafId = 0;
let running = false;
let lastFrame = 0;
let wavePhase = 0;

let mode: InhaleMode = "idle";
let modeStartedAt = 0;

function buildField(): void {
  dots = [];
  const cols = Math.ceil(cssWidth / GRID_SPACING) + 1;
  const rows = Math.ceil(cssHeight / GRID_SPACING) + 1;
  // Hidden dots stay hidden across a resize mid-sign-in.
  const visibility = mode === "inhale" ? 0 : 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const homeX = col * GRID_SPACING + GRID_SPACING / 2;
      const homeY = row * GRID_SPACING + GRID_SPACING / 2;
      dots.push({
        homeX,
        homeY,
        row,
        x: homeX,
        y: homeY,
        vx: 0,
        vy: 0,
        jitter: Math.random(),
        visibility,
        startVisibility: visibility,
        toCardX: 0,
        toCardY: 0,
        distanceToCard: 0,
        order: 0,
      });
    }
  }
}

/** Card center in viewport px — the point the dots are inhaled toward. */
function cardCenter(): { x: number; y: number } {
  const rect = anchor?.getBoundingClientRect();
  if (!rect || !rect.width) return { x: cssWidth / 2, y: cssHeight / 2 };
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function startMode(next: InhaleMode, now: number): void {
  const center = cardCenter();
  const farthest = Math.hypot(Math.max(center.x, cssWidth - center.x), Math.max(center.y, cssHeight - center.y)) || 1;
  for (const dot of dots) {
    const dx = center.x - dot.homeX;
    const dy = center.y - dot.homeY;
    const distance = Math.hypot(dx, dy);
    dot.toCardX = distance ? dx / distance : 0;
    dot.toCardY = distance ? dy / distance : 0;
    dot.distanceToCard = distance;
    dot.order = inhaleOrder(distance / farthest, dot.jitter);
    dot.startVisibility = dot.visibility;
  }
  mode = next;
  modeStartedAt = now;
}

function resize(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  cssWidth = window.innerWidth;
  cssHeight = window.innerHeight;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildField();
  if (mode !== "idle") startMode(mode, modeStartedAt);
  draw();
}

function tick(now: number): void {
  const elapsed = now - modeStartedAt;
  for (const dot of dots) {
    if (mode !== "idle") dot.visibility = dotVisibility(mode, elapsed, dot.order, dot.startVisibility);

    // Spring toward home.
    let ax = (dot.homeX - dot.x) * SPRING;
    let ay = (dot.homeY - dot.y) * SPRING;

    if (pointerActive) {
      // Vector pointing away from the pointer, toward the dot — repulsion,
      // not attraction.
      const dx = dot.x - pointerX;
      const dy = dot.y - pointerY;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist < INFLUENCE_RADIUS) {
        const falloff = 1 - dist / INFLUENCE_RADIUS;
        const push = REPEL_STRENGTH * falloff * falloff;
        ax += (dx / dist) * push;
        ay += (dy / dist) * push;
      }
    }

    dot.vx = (dot.vx + ax) * FRICTION;
    dot.vy = (dot.vy + ay) * FRICTION;
    dot.x += dot.vx;
    dot.y += dot.vy;
  }
}

function draw(): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  for (const dot of dots) {
    if (dot.visibility <= 0.002) continue;
    const look = inhaleLook(mode, dot.visibility, dot.distanceToCard);

    // Two contributions, whichever is bigger wins: proximity is instant —
    // the moment the pointer is close, the dot grows, no waiting on the
    // spring to catch up (grow on approach). Displacement
    // is the fallback once the pointer moves on, so a released dot still
    // fades its glow out gradually as it springs home instead of snapping off.
    let proximity = 0;
    if (pointerActive) {
      const distToPointer = Math.hypot(dot.x - pointerX, dot.y - pointerY);
      if (distToPointer < INFLUENCE_RADIUS) proximity = 1 - distToPointer / INFLUENCE_RADIUS;
    }
    const displacement = Math.hypot(dot.x - dot.homeX, dot.y - dot.homeY);
    const displacementFactor = Math.min(1, displacement / (INFLUENCE_RADIUS * 0.5));
    const pulled = Math.max(proximity, displacementFactor);

    const wave = deltaWave(dot.homeX, dot.row, wavePhase);
    const light = Math.min(1, wave.crest + look.glow);
    const restR = lerpChannel(baseRgb.value[0], crestRgb.value[0], light);
    const restG = lerpChannel(baseRgb.value[1], crestRgb.value[1], light);
    const restB = lerpChannel(baseRgb.value[2], crestRgb.value[2], light);

    const radius = (DOT_RADIUS + (DOT_RADIUS_PEAK - DOT_RADIUS) * pulled) * look.radius;
    const restOpacity = lerpChannel(BASE_OPACITY, CREST_OPACITY, light);
    const opacity = lerpChannel(restOpacity, PEAK_OPACITY, pulled) * look.opacity;
    const r = lerpChannel(restR, peakRgb.value[0], pulled);
    const g = lerpChannel(restG, peakRgb.value[1], pulled);
    const b = lerpChannel(restB, peakRgb.value[2], pulled);

    ctx.beginPath();
    ctx.arc(
      dot.x + dot.toCardX * look.pull,
      dot.y + wave.offsetY + dot.toCardY * look.pull,
      Math.max(0.2, radius),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${opacity.toFixed(3)})`;
    ctx.fill();
  }
}

function frame(now: number): void {
  const dt = lastFrame ? Math.min(now - lastFrame, MAX_FRAME_DELTA) : 0;
  lastFrame = now;
  wavePhase = advanceWavePhase(wavePhase, dt);
  tick(now);
  draw();
  rafId = requestAnimationFrame(frame);
}

function startLoop(): void {
  if (running) return;
  running = true;
  rafId = requestAnimationFrame(frame);
}

function handlePointerMove(e: PointerEvent): void {
  pointerX = e.clientX;
  pointerY = e.clientY;
  pointerActive = true;
}

function handlePointerOut(e: PointerEvent): void {
  // relatedTarget is null specifically when the pointer leaves the whole
  // document, as opposed to moving between elements within it.
  if (!e.relatedTarget) pointerActive = false;
}

let listenersAttached = false;
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Inhale on busy, exhale when it drops (an error — on success the view leaves
// while still busy, so the dots stay inhaled through the exit). Reduced
// motion keeps the static field as is: the card's own spinner says "loading".
watch(
  () => busy,
  (isBusy, wasBusy) => {
    if (prefersReducedMotion || isBusy === wasBusy) return;
    if (!isBusy && mode === "idle") return;
    startMode(isBusy ? "inhale" : "exhale", performance.now());
  },
);

onMounted(() => {
  const canvas = canvasEl.value;
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  if (!ctx) return;

  resize();
  window.addEventListener("resize", resize);

  // The delta wave runs continuously, echoing PublicLayout's own "infinite"
  // background animation — so unlike useMagneticPointer, this loop is never
  // idle-stopped. Reduced-motion still gets a single static draw and no loop
  // at all, matching PublicLayout's own `animation: none` under the same
  // media query.
  if (prefersReducedMotion) return;
  startLoop();

  // Pointer-driven repulsion is a separate, touch-excluded concern from the
  // ambient loop above — no mouse to push away from on a coarse pointer.
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  if (!isCoarsePointer) {
    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerout", handlePointerOut);
    listenersAttached = true;
  }
});

// Redraws immediately on a theme toggle. The loop above already repaints
// every frame in the common case, but under prefers-reduced-motion there is
// no loop at all — without this, that single static draw() from resize()
// would keep showing the old theme's colors until something else forced a
// redraw.
watch([baseRgb, peakRgb], () => draw());

onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  if (listenersAttached) {
    window.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerout", handlePointerOut);
  }
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<style scoped>
/* Fixed to the viewport, independent of the parent's own inset padding, so
   it covers the full backdrop. */
.auth-dot-grid {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
}
</style>
