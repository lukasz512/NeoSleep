<template>
  <!-- Purely decorative — three semi-transparent brand-teal circles that
       "breathe" (see the rAF loop in <script>). Rendered by the public layout,
       not the auth view, so they are on screen from the very first paint
       alongside the medical background — including while the router is still
       checking the session (see AuthBackdrop).
       Composition (NEO-103, "Fale delta"): asymmetric, rule of thirds — the big
       orb bleeds off the bottom-right corner, the medium one sits under the
       logo, only the small one follows the card (its lower-left corner).
       Layers per orb, each owning exactly one transform so none of them ever
       fight over the same property:
         anchor  → static position + pop-in / exit-expand keyframes (CSS)
         drift   → slow elliptical sway, x and y as two layers (CSS)
         breath  → per-frame scale + opacity from the breathing loop (JS)
         orb     → per-frame magnetic-pointer translate (useMagneticPointer) -->
  <div ref="rootEl" class="auth-orbs" :style="rootStyle" aria-hidden="true">
    <div
      v-for="(orb, index) in ORBS"
      :key="orb.key"
      class="auth-orbs__anchor"
      :class="[`auth-orbs__anchor--${orb.key}`, anchorPhaseClass(phases[index])]"
    >
      <div class="auth-orbs__drift-x">
        <div class="auth-orbs__drift-y">
          <div :ref="(el) => setElement(breathRefs[index], el)" class="auth-orbs__breath">
            <span :ref="(el) => setElement(magnetRefs[index], el)" class="auth-orbs__orb" :class="`auth-orbs__orb--${orb.key}`">
              <span :ref="(el) => setElement(rippleRefs[index], el)" class="auth-orbs__ripple" />
              <span class="auth-orbs__ring" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance, type Ref } from "vue";
import { useMagneticPointer } from "../composables/useMagneticPointer";

const { busy = false, anchor = null, instant = false } = defineProps<{
  /** Any loading in progress (session check, sign-in, reset…) — breathing speeds up while true. */
  busy?: boolean;
  /** Element to sit behind (the auth card slot). Null keeps the orbs at their default, card-shaped spot. */
  anchor?: HTMLElement | null;
  /**
   * Start already at rest, skipping the pop-in — for when an identical static
   * backdrop (apps/pwa's HTML boot splash) is already on screen and these
   * orbs are taking over from it rather than appearing for the first time.
   */
  instant?: boolean;
}>();

type OrbKey = "big" | "medium" | "small";
type OrbPhase = "hidden" | "enter" | "exit";

interface OrbSpec {
  key: OrbKey;
  /** One full breath (in + out) while idle — "baaaardzo powoli", very slow. */
  idlePeriod: number;
  /** One full breath while something is loading — noticeably quicker, still a calm rhythm. */
  busyPeriod: number;
  /** Starting point in the cycle, so the three never inhale in lockstep. */
  phaseOffset: number;
  magnet: { strength: number; ease: number };
}

// Bigger orbs breathe slower, the way a larger body has a slower resting
// rhythm — the three periods drift in and out of phase with each other
// instead of pulsing as one block. Smaller orbs also float more with the
// pointer ("lighter things move more"), same depth logic as the logo/badge
// split in AuthChrome.
// Busy periods sit near a calm resting heartbeat (~40–55 bpm) — the first
// pass (2–2.6 s, ±7.5%) measured as practically invisible behind the card.
const ORBS: readonly OrbSpec[] = [
  { key: "big", idlePeriod: 11000, busyPeriod: 1500, phaseOffset: 0, magnet: { strength: 8, ease: 0.06 } },
  { key: "medium", idlePeriod: 9400, busyPeriod: 1300, phaseOffset: 0.33, magnet: { strength: 16, ease: 0.11 } },
  { key: "small", idlePeriod: 8000, busyPeriod: 1100, phaseOffset: 0.66, magnet: { strength: 26, ease: 0.18 } },
];

// How far each breath swells (scale) and how much it brightens (opacity),
// idle vs. busy — while loading the pulse has to read clearly at a glance,
// so it is both much quicker and much deeper than the idle breath.
const SCALE_AMPLITUDE = { idle: 0.035, busy: 0.16 };
const OPACITY_RANGE = { idle: [0.42, 0.58], busy: [0.3, 0.8] } as const;
// Share of each cycle spent inhaling — a real breath swells a bit faster
// than it lets go, so it's asymmetric rather than a plain sine.
const INHALE_SHARE = 0.42;
// Natural variability: every new cycle's length is nudged by up to ±6%, so
// the rhythm never settles into a mechanical metronome.
const CYCLE_JITTER = 0.06;
// How quickly the rhythm eases between idle and busy (ms time constant) — the
// switch never jumps mid-breath, it speeds up / calms down over ~1s.
const MIX_TIME_CONSTANT = 450;
// Loading-only pulse wave: a light ring leaves each orb's rim on every beat
// and fades as it travels outward. Teal orbs on the teal gradient, mostly
// behind the card, barely read as pulsing on scale alone — the lighter ring
// contrasts with the background and travels out past the card's edges.
const RIPPLE_REACH = 0.32;
const RIPPLE_OPACITY = 0.9;
const MAX_FRAME_DELTA = 100;

// Pop-in gaps/duration come from the Fibonacci sequence (in ms) — a growing,
// organic rhythm rather than evenly-spaced steps.
const FIB = { gap1: 89, gap2: 144, popIn: 610 };
const EXIT_DURATION = 1400;

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const rootEl = ref<HTMLElement | null>(null);
// Function refs (see template), not `:ref="someRef"` — inside v-for Vue would
// collect a plain ref binding into an array instead of the single element.
const breathRefs = ORBS.map(() => ref<HTMLElement | null>(null));
const rippleRefs = ORBS.map(() => ref<HTMLElement | null>(null));
const magnetRefs = ORBS.map(() => ref<HTMLElement | null>(null));
ORBS.forEach((orb, index) => useMagneticPointer(magnetRefs[index], orb.magnet));

function setElement(target: Ref<HTMLElement | null>, el: Element | ComponentPublicInstance | null): void {
  target.value = el instanceof HTMLElement ? el : null;
}

// ── Pop-in / exit ───────────────────────────────────────────────────────────
const phases = ref<OrbPhase[]>(ORBS.map(() => "hidden"));

function anchorPhaseClass(phase: OrbPhase): Record<string, boolean> {
  return {
    "auth-orbs__anchor--enter": phase === "enter",
    "auth-orbs__anchor--instant": phase === "enter" && instant,
    "auth-orbs__anchor--exit": phase === "exit",
  };
}

function setPhase(index: number, phase: OrbPhase): void {
  phases.value = phases.value.map((p, i) => (i === index ? phase : p));
}

async function playEnter(): Promise<void> {
  if (prefersReducedMotion || instant) {
    phases.value = ORBS.map(() => "enter");
    return;
  }
  setPhase(0, "enter");
  await wait(FIB.gap1);
  setPhase(1, "enter");
  await wait(FIB.gap2);
  setPhase(2, "enter");
  await wait(FIB.popIn);
}

let enteredPromise: Promise<void> | null = null;
function whenEntered(): Promise<void> {
  enteredPromise ??= playEnter();
  return enteredPromise;
}

/** Pops the orbs back in after an exit that didn't leave the layout (e.g. login → /change-password). */
function replay(): Promise<void> {
  phases.value = ORBS.map(() => "hidden");
  enteredPromise = null;
  return whenEntered();
}

/** Orbs swell past the screen edges and fade out — smallest first, the big one last. */
async function playExit(): Promise<void> {
  if (prefersReducedMotion) {
    phases.value = ORBS.map(() => "exit");
    return;
  }
  setPhase(2, "exit");
  await wait(FIB.gap1);
  setPhase(1, "exit");
  await wait(FIB.gap2 - FIB.gap1);
  setPhase(0, "exit");
  await wait(EXIT_DURATION);
}

// ── Breathing loop ──────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** 0 → 1 → 0 over one cycle: a soft inhale, then a slightly longer exhale. */
function breathCurve(phase: number): number {
  if (phase < INHALE_SHARE) return easeInOutSine(phase / INHALE_SHARE);
  return 1 - easeInOutSine((phase - INHALE_SHARE) / (1 - INHALE_SHARE));
}

function nextJitter(): number {
  return 1 + (Math.random() * 2 - 1) * CYCLE_JITTER;
}

const breathState = ORBS.map((orb) => ({ phase: orb.phaseOffset, jitter: nextJitter() }));
let mix = busy ? 1 : 0;
let lastFrame = 0;
let rafId = 0;

function tick(now: number): void {
  const dt = lastFrame ? Math.min(now - lastFrame, MAX_FRAME_DELTA) : 0;
  lastFrame = now;
  mix += ((busy ? 1 : 0) - mix) * (1 - Math.exp(-dt / MIX_TIME_CONSTANT));

  const amplitude = lerp(SCALE_AMPLITUDE.idle, SCALE_AMPLITUDE.busy, mix);
  const opacityLow = lerp(OPACITY_RANGE.idle[0], OPACITY_RANGE.busy[0], mix);
  const opacityHigh = lerp(OPACITY_RANGE.idle[1], OPACITY_RANGE.busy[1], mix);

  ORBS.forEach((orb, index) => {
    const state = breathState[index];
    // Phase is integrated (not derived from wall-clock time), so changing the
    // period mid-breath changes only the speed, never jumps the position.
    state.phase += dt / (lerp(orb.idlePeriod, orb.busyPeriod, mix) * state.jitter);
    if (state.phase >= 1) {
      state.phase -= 1;
      state.jitter = nextJitter();
    }
    const el = breathRefs[index].value;
    if (!el) return;
    const f = breathCurve(state.phase);
    el.style.transform = `scale(${(1 + amplitude * f).toFixed(4)})`;
    el.style.opacity = lerp(opacityLow, opacityHigh, f).toFixed(3);

    // One wave per beat, launched at the start of each inhale, fading out as
    // it spreads; scaled by `mix` so it only exists while loading (and fades
    // in/out with the rhythm change). Suppressed once the exit takes over.
    const ripple = rippleRefs[index].value;
    if (!ripple) return;
    const strength = phases.value[index] === "exit" ? 0 : mix;
    const travel = 1 - (1 - state.phase) ** 3;
    ripple.style.transform = `scale(${(1 + RIPPLE_REACH * travel).toFixed(4)})`;
    ripple.style.opacity = (strength * RIPPLE_OPACITY * (1 - state.phase) ** 2).toFixed(3);
  });

  rafId = requestAnimationFrame(tick);
}

onMounted(() => {
  void whenEntered();
  if (!prefersReducedMotion) rafId = requestAnimationFrame(tick);
});

onBeforeUnmount(() => cancelAnimationFrame(rafId));

// ── Alignment behind the anchor ─────────────────────────────────────────────
// Only the small orb follows the card: its anchor is positioned from the
// --auth-orbs-card-* variables set here from the anchor element's box — but
// only its position/width live. Its height is
// frozen at the first non-zero reading: the auth card animates its own height
// on every step change (signin ↔ forgot ↔ reset), and tracking that live would
// drag the orbs along with each transition instead of leaving them planted.
interface FrameRect {
  top: number;
  centerX: number;
  width: number;
  height: number;
}

const frameRect = ref<FrameRect | null>(null);
let frozenHeight: number | null = null;
let anchorObserver: ResizeObserver | null = null;
let settleTimer = 0;
// The view enters with a short lift transition (view-fade-lift), so the very
// first reading can be a few px off — one more once that has settled.
const SETTLE_REMEASURE_DELAY = 450;

function measure(): void {
  const el = anchor;
  const root = rootEl.value;
  if (!el || !root) return;
  const rect = el.getBoundingClientRect();
  if (!rect.height) return;
  const rootRect = root.getBoundingClientRect();
  frozenHeight ??= rect.height;
  frameRect.value = {
    top: rect.top - rootRect.top,
    centerX: rect.left - rootRect.left + rect.width / 2,
    width: rect.width,
    height: frozenHeight,
  };
}

watch(
  () => anchor,
  (el) => {
    anchorObserver?.disconnect();
    anchorObserver = null;
    window.clearTimeout(settleTimer);
    frozenHeight = null;
    if (!el) {
      frameRect.value = null;
      return;
    }
    anchorObserver = new ResizeObserver(measure);
    anchorObserver.observe(el);
    settleTimer = window.setTimeout(measure, SETTLE_REMEASURE_DELAY);
  },
  { flush: "post" },
);

onMounted(() => window.addEventListener("resize", measure));
onBeforeUnmount(() => {
  window.removeEventListener("resize", measure);
  anchorObserver?.disconnect();
  window.clearTimeout(settleTimer);
});

const rootStyle = computed(() => {
  const rect = frameRect.value;
  if (!rect) return undefined;
  return {
    "--auth-orbs-card-top": `${rect.top}px`,
    "--auth-orbs-card-center-x": `${rect.centerX}px`,
    "--auth-orbs-card-width": `${rect.width}px`,
    "--auth-orbs-card-height": `${rect.height}px`,
  };
});

defineExpose({ whenEntered, playExit, replay });
</script>

<style scoped>
.auth-orbs {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Card geometry the small orb follows (set live from the anchor, see
   rootStyle). The defaults (before/without an anchor) mirror where AuthView's
   card slot lands: layout padding + the view's own top offset + the logo block
   above the card (AuthChrome: 20px margin + 90px + -11px, then the 16px gap),
   420px wide at most — so the small orb is already where the card will appear
   while the session check runs, and barely moves once the real anchor is
   measured. Same numbers as the boot splash (apps/pwa/src/boot/splash.ts). */
.auth-orbs {
  --auth-orbs-card-top: calc(max(16px, env(safe-area-inset-top)) + clamp(24px, 10vh, 96px) + 115px);
  --auth-orbs-card-center-x: 50%;
  --auth-orbs-card-width: min(420px, calc(100% - 64px));
  --auth-orbs-card-height: 440px;
}

/* Every anchor is centered on its left/top point via the standalone
   `translate` property, so the pop-in / exit keyframes below only ever touch
   `transform: scale()` and compose with it. Sizes in vmax (the big orb is
   0.8 × the longer screen side, the others 0.42 and 0.2 of that) keep the
   composition the same shape on a phone and a wide monitor. */
.auth-orbs__anchor {
  position: absolute;
  aspect-ratio: 1;
  translate: -50% -50%;
  transform: scale(0);
}

.auth-orbs__anchor--big {
  width: 80vmax;
  left: 80%;
  top: 90%;
  --auth-orbs-drift-x: 30px;
  --auth-orbs-drift-y: 22px;
  --auth-orbs-drift-period: 40s;
}

.auth-orbs__anchor--medium {
  width: 33.6vmax;
  left: 20%;
  top: 18%;
  --auth-orbs-drift-x: 22px;
  --auth-orbs-drift-y: 16px;
  --auth-orbs-drift-period: 55s;
}

/* Hugs the card's lower-left corner — the one orb that follows the card. */
.auth-orbs__anchor--small {
  width: 16vmax;
  left: calc(var(--auth-orbs-card-center-x) - var(--auth-orbs-card-width) * 0.62);
  top: calc(var(--auth-orbs-card-top) + var(--auth-orbs-card-height) * 0.82);
  --auth-orbs-drift-x: 14px;
  --auth-orbs-drift-y: 12px;
  --auth-orbs-drift-period: 33s;
  transition:
    left 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    top 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

/* Slow elliptical sway: x and y are separate layers, each a sine-eased
   back-and-forth, a quarter period apart — together an ellipse, so the
   picture never exactly repeats between the three orbs. Starts at
   (0, -drift-y), the spot the static boot splash paints them at. */
.auth-orbs__drift-x,
.auth-orbs__drift-y {
  position: absolute;
  inset: 0;
}

.auth-orbs__drift-x {
  animation: auth-orbs-sway-x calc(var(--auth-orbs-drift-period) / 2) cubic-bezier(0.37, 0, 0.63, 1) infinite alternate;
  animation-delay: calc(var(--auth-orbs-drift-period) / -4);
}

.auth-orbs__drift-y {
  animation: auth-orbs-sway-y calc(var(--auth-orbs-drift-period) / 2) cubic-bezier(0.37, 0, 0.63, 1) infinite alternate;
}

@keyframes auth-orbs-sway-x {
  from {
    translate: calc(var(--auth-orbs-drift-x) * -1) 0;
  }
  to {
    translate: var(--auth-orbs-drift-x) 0;
  }
}

@keyframes auth-orbs-sway-y {
  from {
    translate: 0 calc(var(--auth-orbs-drift-y) * -1);
  }
  to {
    translate: 0 var(--auth-orbs-drift-y);
  }
}

/* Grows past its resting size (105%) before settling back to 100% — a small
   bounce rather than a flat fade. */
.auth-orbs__anchor--enter {
  animation: auth-orbs-pop-in 610ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* Post-login exit: the orbs come *at the user* — they grow with accelerating
   speed (exponential ease-in, like something flying toward the camera) to ~9×,
   going soft-focus as they pass, and only dissolve at the very end, over the
   viewer. The layout dissolves the background underneath in the same beat.
   Two animations on purpose: growth (transform) and dissolve (opacity/blur)
   need different curves — the dissolve must lag the growth, or the orbs fade
   away before they ever fill the screen (which read as shrinking). */
.auth-orbs__anchor--exit {
  animation:
    auth-orbs-grow 1400ms cubic-bezier(0.7, 0, 0.84, 0) forwards,
    auth-orbs-dissolve 1400ms linear forwards;
}

/* Taking over from the static boot splash — already at rest, no pop. */
.auth-orbs__anchor--instant {
  animation: none;
  transform: scale(1);
}

@keyframes auth-orbs-pop-in {
  0% {
    transform: scale(0);
  }
  65% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes auth-orbs-grow {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(9);
  }
}

/* Fully there for the first two thirds (while they swell toward the viewer),
   then melt — opacity down, blur up — once they already cover the screen. */
@keyframes auth-orbs-dissolve {
  0%,
  60% {
    opacity: 1;
    filter: blur(0);
  }
  100% {
    opacity: 0;
    filter: blur(24px);
  }
}

/* Scale + opacity written every frame by the breathing loop — no CSS
   transition/animation here, it would lag that 1:1 per-frame update. */
.auth-orbs__breath {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  will-change: transform, opacity;
}

.auth-orbs__orb {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  will-change: transform;
}

/* Loading pulse wave (see RIPPLE_* in <script>): a soft light ring at the
   orb's rim, painted once as a static radial gradient — the loop only writes
   transform/opacity to it, so it stays compositor-only on phones. */
.auth-orbs__ripple {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle closest-side,
    transparent 78%,
    color-mix(in srgb, rgb(var(--v-theme-primary)) 25%, white 75%) 91%,
    transparent 100%
  );
  opacity: 0;
  pointer-events: none;
  will-change: transform, opacity;
}

/* Thin orbit line just outside the rim — a drawn edge that keeps the orb
   reading as a deliberate shape against the photo. Inside the breath layer,
   so it breathes and fades with the orb (its ~0.5 opacity halves this). */
.auth-orbs__ring {
  position: absolute;
  inset: -4%;
  border: 1px solid rgb(255 255 255 / 0.7);
  border-radius: 50%;
  pointer-events: none;
}

/* Lighter than the other two so the three don't read as one flat,
   same-toned shape. */
.auth-orbs__orb--medium {
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 55%, white 45%);
}

@media (prefers-reduced-motion: reduce) {
  .auth-orbs__anchor--small {
    transition: none;
  }

  .auth-orbs__drift-x,
  .auth-orbs__drift-y {
    animation: none;
  }

  .auth-orbs__anchor--enter {
    animation: none;
    transform: scale(1);
  }

  .auth-orbs__anchor--exit {
    animation: none;
    opacity: 0;
  }
}
</style>
