<template>
  <!-- Purely decorative — three semi-transparent brand-teal circles that sit
       behind the auth card and "breathe" (see the rAF loop in <script>).
       Rendered by the public layout, not the auth view, so they are on screen
       from the very first paint alongside the medical background — including
       while the router is still checking the session (see AuthBackdrop).
       Three nested layers per orb, each owning exactly one transform so none
       of them ever fight over the same property:
         anchor → static position + pop-in / exit-expand keyframes (CSS)
         breath → per-frame scale + opacity from the breathing loop (JS)
         orb    → per-frame magnetic-pointer translate (useMagneticPointer) -->
  <div ref="rootEl" class="auth-orbs" aria-hidden="true">
    <div class="auth-orbs__frame" :style="frameStyle">
      <div
        v-for="(orb, index) in ORBS"
        :key="orb.key"
        class="auth-orbs__anchor"
        :class="[`auth-orbs__anchor--${orb.key}`, anchorPhaseClass(phases[index])]"
      >
        <div :ref="(el) => setElement(breathRefs[index], el)" class="auth-orbs__breath">
          <span :ref="(el) => setElement(magnetRefs[index], el)" class="auth-orbs__orb" :class="`auth-orbs__orb--${orb.key}`" />
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
const ORBS: readonly OrbSpec[] = [
  { key: "big", idlePeriod: 11000, busyPeriod: 2600, phaseOffset: 0, magnet: { strength: 8, ease: 0.06 } },
  { key: "medium", idlePeriod: 9400, busyPeriod: 2250, phaseOffset: 0.33, magnet: { strength: 16, ease: 0.11 } },
  { key: "small", idlePeriod: 8000, busyPeriod: 1950, phaseOffset: 0.66, magnet: { strength: 26, ease: 0.18 } },
];

// How far each breath swells (scale) and how much it brightens (opacity),
// idle vs. busy — the busy breath is both quicker and a little deeper.
const SCALE_AMPLITUDE = { idle: 0.03, busy: 0.075 };
const OPACITY_RANGE = { idle: [0.42, 0.58], busy: [0.34, 0.72] } as const;
// Share of each cycle spent inhaling — a real breath swells a bit faster
// than it lets go, so it's asymmetric rather than a plain sine.
const INHALE_SHARE = 0.42;
// Natural variability: every new cycle's length is nudged by up to ±6%, so
// the rhythm never settles into a mechanical metronome.
const CYCLE_JITTER = 0.06;
// How quickly the rhythm eases between idle and busy (ms time constant) — the
// switch never jumps mid-breath, it speeds up / calms down over ~1s.
const MIX_TIME_CONSTANT = 700;
const MAX_FRAME_DELTA = 100;

// Pop-in gaps/duration come from the Fibonacci sequence (in ms) — a growing,
// organic rhythm rather than evenly-spaced steps.
const FIB = { gap1: 89, gap2: 144, popIn: 610 };
const EXIT_DURATION = 1100;

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const rootEl = ref<HTMLElement | null>(null);
// Function refs (see template), not `:ref="someRef"` — inside v-for Vue would
// collect a plain ref binding into an array instead of the single element.
const breathRefs = ORBS.map(() => ref<HTMLElement | null>(null));
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
  });

  rafId = requestAnimationFrame(tick);
}

onMounted(() => {
  void whenEntered();
  if (!prefersReducedMotion) rafId = requestAnimationFrame(tick);
});

onBeforeUnmount(() => cancelAnimationFrame(rafId));

// ── Alignment behind the anchor ─────────────────────────────────────────────
// The anchors below are positioned in % of the frame, so the frame follows
// the anchor element's box — but only its position/width live. Its height is
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

const frameStyle = computed(() => {
  const rect = frameRect.value;
  if (!rect) return undefined;
  return {
    top: `${rect.top}px`,
    left: `${rect.centerX}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
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

/* Default spot (before/without an anchor) mirrors where AuthView's card slot
   lands: layout padding + the view's own top offset + the logo block above
   the card (AuthChrome: 20px margin + 90px + -11px, then the 16px gap), 420px
   wide at most — so the orbs are already where the card will appear while
   the session check runs, and barely move once the real anchor is measured.
   Horizontally centered via left + translateX(-50%) in both modes, so
   switching to the measured position is a plain top/left/size transition. */
.auth-orbs__frame {
  position: absolute;
  top: calc(max(16px, env(safe-area-inset-top)) + clamp(24px, 10vh, 96px) + 115px);
  left: 50%;
  width: min(420px, calc(100% - 64px));
  height: 440px;
  transform: translateX(-50%);
  transition:
    top 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    left 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.auth-orbs__anchor {
  position: absolute;
  aspect-ratio: 1;
  transform: scale(0);
}

.auth-orbs__anchor--big {
  width: 150%;
  top: 56%;
  left: 70%;
  transform: translate(-50%, -50%) scale(0);
}

.auth-orbs__anchor--medium {
  width: 78%;
  bottom: 35%;
  left: -17%;
}

.auth-orbs__anchor--small {
  width: 102%;
  top: -11%;
  left: -48%;
}

/* Grows past its resting size (105%) before settling back to 100% — a small
   bounce rather than a flat fade. --big carries its own centering translate,
   so it gets its own keyframes that keep that translate at every step. */
.auth-orbs__anchor--enter {
  animation: auth-orbs-pop-in 610ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.auth-orbs__anchor--big.auth-orbs__anchor--enter {
  animation-name: auth-orbs-pop-in-centered;
}

/* Post-login exit: each orb swells far past the screen edges and thins out
   as it goes, while the layout dissolves the background underneath at the
   same time — the orbs read as pulling the whole canvas away with them.
   Slow gather at the start, a long soft tail at the end. */
.auth-orbs__anchor--exit {
  animation: auth-orbs-expand 1100ms cubic-bezier(0.5, 0, 0.2, 1) forwards;
}

.auth-orbs__anchor--big.auth-orbs__anchor--exit {
  animation-name: auth-orbs-expand-centered;
}

/* Taking over from the static boot splash — already at rest, no pop. */
.auth-orbs__anchor--instant,
.auth-orbs__anchor--big.auth-orbs__anchor--instant {
  animation: none;
}

.auth-orbs__anchor--instant {
  transform: scale(1);
}

.auth-orbs__anchor--big.auth-orbs__anchor--instant {
  transform: translate(-50%, -50%) scale(1);
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

@keyframes auth-orbs-pop-in-centered {
  0% {
    transform: translate(-50%, -50%) scale(0);
  }
  65% {
    transform: translate(-50%, -50%) scale(1.05);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes auth-orbs-expand {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  40% {
    opacity: 0.9;
  }
  100% {
    transform: scale(5);
    opacity: 0;
  }
}

@keyframes auth-orbs-expand-centered {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  40% {
    opacity: 0.9;
  }
  100% {
    transform: translate(-50%, -50%) scale(5);
    opacity: 0;
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

/* Lighter than the other two so the three don't read as one flat,
   same-toned shape. */
.auth-orbs__orb--medium {
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 55%, white 45%);
}

@media (prefers-reduced-motion: reduce) {
  .auth-orbs__frame {
    transition: none;
  }

  .auth-orbs__anchor--enter {
    animation: none;
    transform: scale(1);
  }

  .auth-orbs__anchor--big.auth-orbs__anchor--enter {
    transform: translate(-50%, -50%) scale(1);
  }

  .auth-orbs__anchor--exit {
    animation: none;
    opacity: 0;
  }
}
</style>
