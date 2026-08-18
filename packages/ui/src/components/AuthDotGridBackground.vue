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
// spring has caught up. On top of that, every dot pulses white and back on
// its own sine cycle, biased to spend more time bright (see ambientFactor),
// phase-offset by grid position so it reads as a wave drifting across the
// field rather than every dot flashing in unison — independent of the
// pointer, meant to echo PublicLayout's animated page-background gradient
// showing through the gaps between dots, so the two read as one interwoven
// motion rather than a static grid over a moving backdrop. Real per-frame
// force/color accumulation (not eased/interpolated appearance values) is what keeps
// this from ever popping or jumping between states — only continuous,
// physically-integrated motion.
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { brandColors } from "@brand/colors";

const { dark = false } = defineProps<{ dark?: boolean }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);

// Spacing between grid cells, in px. Smaller = denser field of smaller dots.
const GRID_SPACING = 24;

const DOT_RADIUS = 1.6;
const DOT_RADIUS_PEAK = 4.2;
// Always-visible at rest ("kratka zawsze widoczna") — this is the resting
// opacity, not a near-zero value waiting for interaction to reveal it.
const BASE_OPACITY = 0.38;
const PEAK_OPACITY = 0.85;

// --- Physics (per dot, mass = 1, frame-coupled — see tick()) ---------------
// Spring pulling each dot back to its spiral home position.
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

// Full ambient color cycle, in ms, and the spatial wavelength (px) of the
// phase offset across the grid — small enough relative to the viewport that
// several wave crests are visible at once, drifting as a slow-moving band of
// color rather than every dot flashing in unison.
const AMBIENT_PERIOD_MS = 6000;
const AMBIENT_WAVELENGTH = 260;
// Biases the sine toward its bright (white) end — raw sine spends as much
// time near the dim end as the bright one, which read as barely-there.
// x^AMBIENT_BIAS with a bias < 1 pulls mid-range values up, so a dot spends
// visibly more of each cycle looking white, not just teal with an
// occasional, easy-to-miss tint shift.
const AMBIENT_BIAS = 0.45;
// How far the ambient pulse alone (no pointer nearby) lifts opacity toward
// PEAK_OPACITY — a white dot at BASE_OPACITY would just look pale, not white.
const AMBIENT_PEAK_OPACITY = 0.68;

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerpChannel(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Three-color blend per dot: resting brand tone <-> white (ambient, idle
// pulse, see AMBIENT_PERIOD_MS) <-> deepened/brightened peak tone (pointer
// proximity, see draw()'s `pulled`). Peak still wins once the pointer is
// close — the ambient pulse is only visible at rest or partway into the push
// field.
const baseRgb = computed(() => hexToRgb(dark ? brandColors.primaryOnDark : brandColors.primary));
const ambientRgb = computed(() => hexToRgb(brandColors.white));
const peakRgb = computed(() => hexToRgb(dark ? brandColors.white : brandColors.primaryDark));

function ambientFactor(homeX: number, homeY: number, now: number): number {
  const phase = (now / AMBIENT_PERIOD_MS) * Math.PI * 2 + (homeX + homeY) / AMBIENT_WAVELENGTH;
  const raw = (Math.sin(phase) + 1) / 2;
  return raw ** AMBIENT_BIAS;
}

interface Dot {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
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

function buildField(): void {
  dots = [];
  const cols = Math.ceil(cssWidth / GRID_SPACING) + 1;
  const rows = Math.ceil(cssHeight / GRID_SPACING) + 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const homeX = col * GRID_SPACING;
      const homeY = row * GRID_SPACING;
      dots.push({ homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0 });
    }
  }
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
  draw(performance.now());
}

function tick(): void {
  for (const dot of dots) {
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

function draw(now: number): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  for (const dot of dots) {
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

    const ambient = ambientFactor(dot.homeX, dot.homeY, now);
    const restR = lerpChannel(baseRgb.value[0], ambientRgb.value[0], ambient);
    const restG = lerpChannel(baseRgb.value[1], ambientRgb.value[1], ambient);
    const restB = lerpChannel(baseRgb.value[2], ambientRgb.value[2], ambient);

    const radius = DOT_RADIUS + (DOT_RADIUS_PEAK - DOT_RADIUS) * pulled;
    const restOpacity = lerpChannel(BASE_OPACITY, AMBIENT_PEAK_OPACITY, ambient);
    const opacity = lerpChannel(restOpacity, PEAK_OPACITY, pulled);
    const r = lerpChannel(restR, peakRgb.value[0], pulled);
    const g = lerpChannel(restG, peakRgb.value[1], pulled);
    const b = lerpChannel(restB, peakRgb.value[2], pulled);

    ctx.beginPath();
    ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${opacity.toFixed(3)})`;
    ctx.fill();
  }
}

function frame(now: number): void {
  tick();
  draw(now);
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

onMounted(() => {
  const canvas = canvasEl.value;
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  if (!ctx) return;

  resize();
  window.addEventListener("resize", resize);

  // The ambient color drift (see AMBIENT_PERIOD_MS) runs continuously,
  // echoing PublicLayout's own "infinite" background animation — so unlike
  // useMagneticPointer, this loop is never idle-stopped. Reduced-motion
  // still gets a single static draw and no loop at all, matching
  // PublicLayout's own `animation: none` under the same media query.
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
watch([baseRgb, peakRgb], () => draw(performance.now()));

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
