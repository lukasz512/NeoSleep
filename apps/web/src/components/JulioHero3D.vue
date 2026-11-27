<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { JulioLang, JulioStep } from "../config/julioContent";
import { julioHeroLabels } from "../config/julioHeroLabels";

/**
 * Hero of the private proposal page: the real order form (an app screenshot) in a light
 * device frame with a restrained CSS tilt, plus a frosted-glass order timeline.
 * Form values are animated over the screenshot so the form looks alive.
 * Pure DOM/CSS: no WebGL, so there is no fallback path to maintain.
 */

const props = defineProps<{
  lang: JulioLang;
  title: string;
  steps: JulioStep[];
  fallbackSrc: string;
}>();

const labels = computed(() => julioHeroLabels[props.lang]);

interface FormFrame {
  mr: number;
  mp: number;
  left: number;
  right: number;
  press: "mr-minus" | "mr-plus" | "mp-minus" | "mp-plus" | "left-plus" | "right-plus" | null;
}

// A short, repeating edit session: values are added and removed in the real form.
const FORM_SCRIPT: FormFrame[] = [
  { mr: -2, mp: 8, left: 0, right: 0, press: null },
  { mr: -1, mp: 8, left: 0, right: 0, press: "mr-plus" },
  { mr: 0, mp: 8, left: 0, right: 0, press: "mr-plus" },
  { mr: 0, mp: 9, left: 0, right: 0, press: "mp-plus" },
  { mr: 0, mp: 10, left: 0, right: 0, press: "mp-plus" },
  { mr: 0, mp: 10, left: 1, right: 0, press: "left-plus" },
  { mr: 0, mp: 10, left: 1, right: 1, press: "right-plus" },
  { mr: 0, mp: 9, left: 1, right: 1, press: "mp-minus" },
  { mr: -1, mp: 9, left: 1, right: 1, press: "mr-minus" },
  { mr: -2, mp: 8, left: 0, right: 0, press: null },
];

const formIdx = ref(0);
const tick = ref(0);
const frame = computed<FormFrame>(
  () => FORM_SCRIPT[formIdx.value % FORM_SCRIPT.length] ?? FORM_SCRIPT[0]!,
);
const range = computed(() => frame.value.mp - frame.value.mr);

// Glass timeline: labels appear one by one first, then the highlight walks the steps.
const n = computed(() => props.steps.length);
const cycleLen = computed(() => n.value * 2 + 4);
const shown = computed(() => Math.min(n.value, Math.max(0, (tick.value % cycleLen.value) - 1)));
const active = computed(() => {
  const t = (tick.value % cycleLen.value) - (n.value + 2);
  return t < 0 ? -1 : Math.min(n.value - 1, t);
});
const progress = computed(() => (active.value < 0 ? 0 : ((active.value + 1) / n.value) * 100));

const stage = ref<HTMLElement | null>(null);
const tiltX = ref(0);
const tiltY = ref(0);
let timer: number | undefined;
let io: IntersectionObserver | undefined;
let visible = true;

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
    // Static, readable end state.
    formIdx.value = 4;
    tick.value = n.value + 2 + 2;
    return;
  }
  timer = window.setInterval(() => {
    if (!visible) return;
    tick.value += 1;
    formIdx.value += 1;
  }, 1300);
  if (stage.value && "IntersectionObserver" in window) {
    io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
    });
    io.observe(stage.value);
  }
  window.addEventListener("pointermove", onPointer, { passive: true });
});

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
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
        <div class="julio-hero3d__screen">
          <img class="julio-hero3d__shot" :src="fallbackSrc" alt="" />
          <!-- Live values drawn over the real form -->
          <span class="val val--mr">{{ frame.mr }}</span>
          <span class="val val--mp">{{ frame.mp }}</span>
          <span class="val val--range">{{ range }}</span>
          <span class="val val--left">{{ frame.left }}</span>
          <span class="val val--right">{{ frame.right }}</span>
          <span v-if="frame.press" :key="formIdx" class="tap" :class="`tap--${frame.press}`"></span>
        </div>
      </div>

      <div class="julio-glass">
        <div class="julio-glass__head">
          <span class="julio-glass__dot"></span>
          <span class="julio-glass__title">{{ title }}</span>
        </div>
        <ol class="julio-glass__steps">
          <li
            v-for="(s, i) in steps"
            :key="s.label"
            class="julio-glass__step"
            :class="{ 'is-shown': i < shown, 'is-active': i === active, 'is-done': i < active }"
          >
            <span class="julio-glass__marker"></span>
            <span class="julio-glass__label">{{ s.label }}</span>
            <span class="julio-glass__status">{{ s.status }}</span>
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
  padding: 2.2%;
  background: #fff;
  border: 1px solid var(--website-border, #e3e6e5);
  border-radius: 28px;
  box-shadow:
    0 24px 48px -20px rgba(16, 84, 78, 0.35),
    0 2px 6px rgba(16, 84, 78, 0.08);
  transform: rotateY(calc(-7deg + var(--ty, 0deg))) rotateX(calc(2deg + var(--tx, 0deg)));
  transition: transform 0.25s ease-out;
  animation: julio-sway 9s ease-in-out infinite;
}
.julio-hero3d__screen {
  position: relative;
  aspect-ratio: 900 / 769;
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
}
.julio-hero3d__shot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* Values over the real form, positions in % of the 900 x 769 screenshot */
.val {
  position: absolute;
  background: #fff;
  color: #474747;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--website-font-sans, inherit);
  font-size: clamp(11px, 1.9vw, 19px);
  line-height: 1;
}
.val--mr,
.val--mp {
  left: 18.4%;
  width: 18.3%;
  height: 5.2%;
}
.val--mr {
  top: 34.2%;
}
.val--mp {
  top: 46.3%;
}
.val--range {
  left: 68.6%;
  top: 39.5%;
  width: 8.6%;
  height: 7%;
  color: #10544e;
  font-weight: 600;
  font-size: clamp(18px, 4vw, 36px);
}
.val--left,
.val--right {
  top: 66%;
  width: 8.6%;
  height: 5%;
}
.val--left {
  left: 23.2%;
}
.val--right {
  left: 69.4%;
}

.tap {
  position: absolute;
  width: 6.4%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(18, 143, 131, 0.35);
  transform: translate(-50%, -50%);
  animation: julio-tap 1s ease-out forwards;
  pointer-events: none;
}
.tap--mr-plus {
  left: 40.6%;
  top: 37%;
}
.tap--mr-minus {
  left: 13.8%;
  top: 37%;
}
.tap--mp-plus {
  left: 40.6%;
  top: 49%;
}
.tap--mp-minus {
  left: 13.8%;
  top: 49%;
}
.tap--left-plus {
  left: 35.1%;
  top: 68.7%;
}
.tap--right-plus {
  left: 81.1%;
  top: 68.7%;
}

/* Frosted glass order timeline, light variant of the earlier review design */
.julio-glass {
  position: absolute;
  right: 0;
  bottom: 2%;
  width: 46%;
  padding: 16px 18px 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.55);
  -webkit-backdrop-filter: blur(18px) saturate(1.5);
  backdrop-filter: blur(18px) saturate(1.5);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow:
    0 20px 40px -18px rgba(16, 84, 78, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: var(--website-text, #474747);
  font-family: var(--website-font-sans, inherit);
  animation: julio-float 7s ease-in-out infinite;
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
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 0.45s ease,
    transform 0.45s ease,
    background 0.4s ease;
}
.julio-glass__step.is-shown {
  opacity: 0.7;
  transform: none;
}
.julio-glass__step.is-done {
  opacity: 0.9;
}
.julio-glass__step.is-active {
  opacity: 1;
  background: rgba(18, 143, 131, 0.16);
  font-weight: 600;
}
.julio-glass__marker {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #128f83;
  background: transparent;
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
  color: #10544e;
  opacity: 0;
  transition: opacity 0.4s ease;
}
.is-active .julio-glass__status,
.is-done .julio-glass__status {
  opacity: 1;
}
.julio-glass__bar {
  margin-top: 12px;
  height: 5px;
  border-radius: 99px;
  background: rgba(16, 84, 78, 0.12);
  overflow: hidden;
}
.julio-glass__bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #128f83, #3fc1b3);
  border-radius: inherit;
  transition: width 0.6s ease;
}

@keyframes julio-sway {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -5px;
  }
}
@keyframes julio-float {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -7px;
  }
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
  .julio-glass {
    animation: none;
    transition: none;
  }
}
</style>
