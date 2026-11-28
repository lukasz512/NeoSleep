<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { JulioLang, JulioStep } from "../config/julioContent";
import { julioHeroLabels } from "../config/julioHeroLabels";

/**
 * Hero of the private proposal page: the real order form (an app screenshot) on a light
 * tablet with a restrained tilt, plus a frosted-glass order card. A one-shot ~5 s demo:
 * the midline deviation is edited (the lower jaw moves), then "Mi pedido" appears whole,
 * its steps advance one by one, and on "Entregado" the form turns into a "ready" check.
 * Pure DOM/CSS, no WebGL.
 */

const props = defineProps<{
  lang: JulioLang;
  title: string;
  steps: JulioStep[];
  fallbackSrc: string;
}>();

const labels = computed(() => julioHeroLabels[props.lang]);

type Press = "left-plus" | "left-minus" | "right-plus" | null;

interface FormFrame {
  at: number;
  left: number;
  right: number;
  press: Press;
}

// Phase A: the midline deviation is edited in the real form; the jaw follows (right - left).
const FORM_FRAMES: FormFrame[] = [
  { at: 300, left: 1, right: 0, press: "left-plus" },
  { at: 600, left: 2, right: 0, press: "left-plus" },
  { at: 900, left: 1, right: 0, press: "left-minus" },
  { at: 1200, left: 0, right: 0, press: "left-minus" },
  { at: 1500, left: 0, right: 1, press: "right-plus" },
  { at: 1800, left: 0, right: 2, press: "right-plus" },
];
const CARD_AT = 2100; // the glass card appears whole, all rows at once
const FIRST_STEP_AT = 2500;
const STEP_MS = 650;
const READY_DELAY = 500; // after the last step is reached

const left = ref(0);
const right = ref(0);
const press = ref<Press>(null);
const pressKey = ref(0);
const cardShown = ref(false);
const active = ref(-1); // index of the step in progress; steps.length = all done
const ready = ref(false);

const jaw = computed(() => right.value - left.value);
const total = computed(() => props.steps.length);
const progress = computed(() =>
  active.value < 0 ? 0 : (Math.min(active.value + 1, total.value) / total.value) * 100,
);

function statusOf(i: number): string {
  if (i < active.value) return labels.value.done;
  if (i === active.value) return labels.value.now;
  return labels.value.pending;
}

const stage = ref<HTMLElement | null>(null);
const tiltX = ref(0);
const tiltY = ref(0);
let timers: number[] = [];
let io: IntersectionObserver | undefined;
let started = false;

function later(ms: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, ms));
}

function showFinal(): void {
  left.value = 0;
  right.value = 2;
  cardShown.value = true;
  active.value = total.value;
  ready.value = true;
}

function play(): void {
  if (started) return;
  started = true;
  for (const f of FORM_FRAMES) {
    later(f.at, () => {
      left.value = f.left;
      right.value = f.right;
      press.value = f.press;
      pressKey.value += 1;
    });
  }
  later(CARD_AT, () => {
    cardShown.value = true;
  });
  const n = total.value;
  for (let i = 0; i < n; i += 1) {
    later(FIRST_STEP_AT + i * STEP_MS, () => {
      active.value = i;
    });
  }
  later(FIRST_STEP_AT + (n - 1) * STEP_MS + READY_DELAY, () => {
    active.value = n;
    ready.value = true;
  });
}

function onPointer(e: PointerEvent): void {
  const el = stage.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - (r.left + r.width / 2)) / Math.max(r.width, 1);
  const py = (e.clientY - (r.top + r.height / 2)) / Math.max(r.height, 1);
  tiltY.value = Math.max(-1, Math.min(1, px)) * 3;
  tiltX.value = Math.max(-1, Math.min(1, py)) * -2;
}

onMounted(() => {
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    showFinal();
    return;
  }
  if (stage.value && "IntersectionObserver" in window) {
    io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        play();
        io?.disconnect();
      }
    });
    io.observe(stage.value);
  } else {
    play();
  }
  window.addEventListener("pointermove", onPointer, { passive: true });
});

onBeforeUnmount(() => {
  for (const t of timers) window.clearTimeout(t);
  timers = [];
  io?.disconnect();
  window.removeEventListener("pointermove", onPointer);
});
</script>

<template>
  <div class="julio-hero3d" role="img" :aria-label="labels.alt">
    <div
      ref="stage"
      class="julio-hero3d__scene"
      :style="{ '--tx': `${tiltX}deg`, '--ty': `${tiltY}deg` }"
      aria-hidden="true"
    >
      <div class="julio-hero3d__device">
        <span class="julio-hero3d__camera"></span>
        <div class="julio-hero3d__screen" :class="{ 'is-ready': ready }">
          <img class="julio-hero3d__shot" :src="fallbackSrc" alt="" />
          <!-- Lower jaw: a clipped copy of the form teeth that slides sideways -->
          <div class="jaw">
            <img
              class="jaw__img"
              :src="fallbackSrc"
              alt=""
              :style="{ transform: `translateX(${jaw}%)` }"
            />
          </div>
          <span class="val val--left">{{ left }}</span>
          <span class="val val--right">{{ right }}</span>
          <span v-if="press" :key="pressKey" class="tap" :class="`tap--${press}`"></span>
          <span class="julio-hero3d__home"></span>

          <div class="ready" :class="{ 'is-on': ready }">
            <svg class="ready__svg" viewBox="0 0 64 64" aria-hidden="true">
              <circle class="ready__ring" cx="32" cy="32" r="28" />
              <path class="ready__check" d="M19 33 l9 9 l17 -19" />
            </svg>
            <span class="ready__label">{{ labels.ready }}</span>
          </div>
        </div>
      </div>

      <div class="julio-glass" :class="{ 'is-on': cardShown }">
        <div class="julio-glass__head">
          <span class="julio-glass__dot"></span>
          <span class="julio-glass__title">{{ title }}</span>
        </div>
        <ol class="julio-glass__steps">
          <li
            v-for="(s, i) in steps"
            :key="s.label"
            class="julio-glass__step"
            :class="{ 'is-active': i === active, 'is-done': i < active }"
          >
            <span class="julio-glass__marker"></span>
            <span class="julio-glass__label">{{ s.label }}</span>
            <span class="julio-glass__status">{{ statusOf(i) }}</span>
          </li>
        </ol>
        <div class="julio-glass__bar"><span :style="{ width: `${progress}%` }"></span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.julio-hero3d {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 560px;
}
.julio-hero3d__scene {
  position: absolute;
  inset: 0;
  perspective: 1400px;
}
.julio-hero3d__device {
  position: absolute;
  left: 0;
  top: 4%;
  width: 84%;
  padding: 2.4% 2.4% 2.4%;
  background: linear-gradient(145deg, #f4f7f6, #dfe6e4);
  border: 1px solid #cdd6d4;
  border-radius: 30px;
  box-shadow:
    0 28px 50px -22px rgba(16, 84, 78, 0.45),
    0 2px 6px rgba(16, 84, 78, 0.1),
    inset 0 1px 0 #fff;
  transform: rotateY(calc(-7deg + var(--ty, 0deg))) rotateX(calc(2deg + var(--tx, 0deg)));
  transition: transform 0.25s ease-out;
}
.julio-hero3d__camera {
  position: absolute;
  left: 50%;
  top: 1%;
  width: 6px;
  height: 6px;
  margin-left: -3px;
  border-radius: 50%;
  background: #9aa8a5;
}
.julio-hero3d__screen {
  position: relative;
  aspect-ratio: 900 / 769;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(16, 84, 78, 0.18);
}
.julio-hero3d__shot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  transition:
    opacity 0.5s ease,
    filter 0.5s ease;
}
.is-ready .julio-hero3d__shot,
.is-ready .jaw,
.is-ready .val {
  opacity: 0.18;
  filter: blur(2px);
}
.julio-hero3d__home {
  position: absolute;
  left: 50%;
  bottom: 1.4%;
  width: 22%;
  height: 4px;
  margin-left: -11%;
  border-radius: 99px;
  background: rgba(38, 59, 57, 0.35);
}

/* Lower jaw window, positions in % of the 900 x 769 screenshot */
.jaw {
  position: absolute;
  left: 39.5%;
  top: 69%;
  width: 21%;
  height: 5.9%;
  overflow: hidden;
  background: #fff;
  transition:
    opacity 0.5s ease,
    filter 0.5s ease;
}
.jaw__img {
  position: absolute;
  width: 476.2%;
  height: 1694.9%;
  left: -188.1%;
  top: -1169.5%;
  max-width: none;
  /* Overshoot easing gives the jaw a small grinding bounce at each step */
  transition: transform 0.34s cubic-bezier(0.3, 1.8, 0.5, 1);
}

/* Values over the real form */
.val {
  position: absolute;
  top: 66%;
  width: 8.6%;
  height: 5%;
  background: #fff;
  color: #474747;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--website-font-sans, inherit);
  font-size: clamp(11px, 1.9vw, 19px);
  line-height: 1;
  transition:
    opacity 0.5s ease,
    filter 0.5s ease;
}
.val--left {
  left: 23.2%;
}
.val--right {
  left: 69.4%;
}

.tap {
  position: absolute;
  top: 68.6%;
  width: 6.4%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(18, 143, 131, 0.35);
  transform: translate(-50%, -50%);
  animation: julio-tap 0.7s ease-out forwards;
  pointer-events: none;
}
.tap--left-minus {
  left: 19.4%;
}
.tap--left-plus {
  left: 35.1%;
}
.tap--right-plus {
  left: 81.2%;
}

/* "Ready" state: green circle and check draw themselves */
.ready {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  opacity: 0;
  pointer-events: none;
}
.ready.is-on {
  opacity: 1;
}
.ready__svg {
  width: 26%;
  overflow: visible;
}
.ready__ring,
.ready__check {
  fill: none;
  stroke: #16a34a;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ready__ring {
  stroke-dasharray: 176;
  stroke-dashoffset: 176;
  transform: rotate(-90deg);
  transform-origin: 32px 32px;
}
.ready__check {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
}
.ready.is-on .ready__ring {
  animation: julio-draw 0.6s ease-out forwards;
  --len: 176;
}
.ready.is-on .ready__check {
  animation: julio-draw 0.4s ease-out 0.45s forwards;
  --len: 40;
}
.ready__label {
  font-family: var(--website-font-sans, inherit);
  font-weight: 600;
  font-size: clamp(14px, 2.2vw, 22px);
  color: #15803d;
  opacity: 0;
}
.ready.is-on .ready__label {
  animation: julio-rise 0.5s ease-out 0.7s forwards;
}

/* Frosted glass order card: opaque enough to read on a white page */
.julio-glass {
  position: absolute;
  right: 0;
  bottom: 2%;
  width: 46%;
  padding: 16px 18px 18px;
  border-radius: 22px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.94), rgba(226, 244, 241, 0.9));
  -webkit-backdrop-filter: blur(18px) saturate(1.5);
  backdrop-filter: blur(18px) saturate(1.5);
  border: 1px solid rgba(18, 143, 131, 0.28);
  box-shadow:
    0 22px 44px -18px rgba(16, 84, 78, 0.5),
    0 2px 8px rgba(16, 84, 78, 0.12),
    inset 0 1px 0 #fff;
  color: #263b39;
  font-family: var(--website-font-sans, inherit);
  opacity: 0;
  transform: translateY(14px) scale(0.97);
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}
.julio-glass.is-on {
  opacity: 1;
  transform: none;
}
.julio-glass__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 600;
  font-size: 14px;
  color: #10544e;
}
.julio-glass__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #128f83;
}
.julio-glass__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.julio-glass__step {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 10px;
  font-size: 12.5px;
  color: #263b39;
  transition: background 0.35s ease;
}
.julio-glass__step.is-active {
  background: rgba(18, 143, 131, 0.18);
  font-weight: 600;
  color: #0b3f3a;
}
.julio-glass__marker {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #128f83;
  background: transparent;
  transition: background 0.3s ease;
}
.is-done .julio-glass__marker {
  background: #128f83;
}
.is-active .julio-glass__marker {
  background: #128f83;
  box-shadow: 0 0 0 4px rgba(18, 143, 131, 0.22);
}
.julio-glass__status {
  font-size: 11px;
  color: #5a6e6c;
}
.is-active .julio-glass__status,
.is-done .julio-glass__status {
  color: #10544e;
  font-weight: 600;
}
.julio-glass__bar {
  margin-top: 12px;
  height: 5px;
  border-radius: 99px;
  background: rgba(16, 84, 78, 0.14);
  overflow: hidden;
}
.julio-glass__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #128f83, #3fc1b3);
  border-radius: inherit;
  transition: width 0.5s ease;
}

@keyframes julio-tap {
  0% {
    opacity: 0.9;
    scale: 0.6;
  }
  100% {
    opacity: 0;
    scale: 1.6;
  }
}
@keyframes julio-draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes julio-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 800px) {
  .julio-hero3d {
    aspect-ratio: auto;
    max-height: none;
  }
  .julio-hero3d__scene {
    position: static;
    display: grid;
    gap: 16px;
  }
  .julio-hero3d__device {
    position: relative;
    width: 100%;
    top: 0;
  }
  .julio-glass {
    position: relative;
    width: 92%;
    margin: -48px 0 0 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .julio-hero3d__device,
  .julio-glass,
  .jaw__img,
  .ready * {
    animation: none !important;
    transition: none !important;
  }
  .ready__ring,
  .ready__check {
    stroke-dashoffset: 0;
  }
  .ready__label {
    opacity: 1;
  }
}
</style>
