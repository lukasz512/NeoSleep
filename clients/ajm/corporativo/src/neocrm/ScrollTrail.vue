<!-- The thing that travels with the reader (CORE-215 round 6), flat: one object going down the left margin.
     Scrolling puts it together: a loose note, a stack, a box, the box sealed, a parcel, and a paper plane
     that lands on the demo request. Its route is never drawn (round 10). This is what a browser without
     WebGL, or a reader on a data saver, gets instead of the 3D parcel (LivePaper.vue). Decoration only:
     hidden from screen readers, nothing to focus, moved by scrolling alone, not drawn under reduced motion. -->
<template>
  <div v-if="!still" ref="root" class="trail" :class="{ 'is-landed': landed }" :data-stage="TRAIL_STAGES[stage]" :style="{ '--p': p }" aria-hidden="true">
    <div class="trail__obj" :style="{ transform: `translate(${x}px, ${y}px) rotate(${tilt}deg)` }">
      <svg class="trail__art" viewBox="0 0 48 48">
        <g class="shape shape--note">
          <g class="spin">
            <path class="f1" d="M10 9h28v22l-8 8H10z" />
            <path d="M38 31h-8v8M15 17h18M15 23h12" />
          </g>
        </g>
        <g class="shape shape--stack">
          <rect class="f3 piece piece--a" x="8" y="14" width="24" height="24" rx="2" />
          <rect class="f2 piece piece--b" x="15" y="9" width="24" height="24" rx="2" />
          <g class="piece piece--c">
            <rect class="f1" x="12" y="15" width="24" height="24" rx="2" />
            <path d="M17 23h14M17 29h9" />
          </g>
        </g>
        <g class="shape shape--box">
          <rect class="f1 drop" x="15" y="2" width="18" height="20" rx="2" />
          <path class="f2" d="M8 22h32v20H8z" />
          <path d="M8 22L2 14M40 22l6-8" />
        </g>
        <g class="shape shape--sealed">
          <g class="rock">
            <path class="f2" d="M8 16h32v26H8z" />
            <path d="M8 24h32" />
            <rect class="f3 tape" x="21" y="16" width="6" height="26" />
          </g>
        </g>
        <g class="shape shape--parcel">
          <path class="f2" d="M8 16h32v26H8z" />
          <rect class="f3" x="21" y="16" width="6" height="26" />
          <path class="string" d="M8 30h32" pathLength="1" />
          <rect class="f1 label" x="29" y="20" width="9" height="7" rx="1" />
          <circle class="stamp" cx="15" cy="36" r="4" />
        </g>
        <g class="shape shape--plane">
          <g class="fly">
            <path class="f1" d="M4 22L44 6 32 42 22 30z" />
            <path d="M44 6L22 30v10l5-6" />
            <path class="wind" d="M2 34l8-3M5 43l8-4" />
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { TRAIL_STAGES, trailStage, trailTilt, trailX } from "./trail";

// asked once: a reader who wants less motion gets no trail at all
const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const root = ref<HTMLElement | null>(null);
const stage = ref(0);
const p = ref(0);
const landed = ref(false);
const width = ref(48);
const y = ref(0);

const x = computed(() => trailX(y.value, width.value));
const tilt = computed(() => trailTilt(y.value));

/** Reads the page and puts the object where the reader is: at 45 % of the first screen, on the demo request at the end. */
function update() {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const range = document.documentElement.scrollHeight - window.innerHeight;
  const progress = range > 0 ? window.scrollY / range : 0;
  const start = Math.max(0, window.innerHeight * 0.45 - (rect.top + window.scrollY));
  const demo = document.getElementById("demo");
  const at = trailStage(progress);
  width.value = rect.width || 48;
  const end = Math.max(start, demo ? demo.getBoundingClientRect().top - rect.top + 56 : rect.height);
  y.value = start + Math.min(1, Math.max(0, progress)) * (end - start);
  stage.value = at.stage;
  p.value = at.p;
  landed.value = progress >= 0.995;
}

onMounted(() => {
  if (still) return;
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", update);
  window.removeEventListener("resize", update);
});
</script>

<style scoped>
.trail {
  --size: 30px;
  --land: 18px 4px;
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--ncrm-gutter);
  z-index: 2;
  pointer-events: none;
}
@media (min-width: 900px) {
  .trail {
    --size: 48px;
  }
}
/* room beside the page: the object moves out of the text's way */
@media (min-width: 1240px) {
  .trail {
    --size: 64px;
    --land: 92px 34px;
    left: -32px;
  }
}
.trail__obj {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--size);
  height: var(--size);
  margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
}
.trail__art {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
  stroke: var(--ncrm-note-ink);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 3px 4px var(--ncrm-note-shadow));
}
.f1 {
  fill: var(--ncrm-note-1);
}
.f2 {
  fill: var(--ncrm-note-2);
}
.f3 {
  fill: var(--ncrm-note-3);
}

/* one shape at a time; the next one pops in */
.shape {
  opacity: 0;
  scale: 0.4;
  transform-origin: 24px 24px;
  transition:
    opacity 0.18s,
    scale 0.4s cubic-bezier(0.3, 1.7, 0.5, 1);
}
.trail[data-stage="note"] .shape--note,
.trail[data-stage="stack"] .shape--stack,
.trail[data-stage="box"] .shape--box,
.trail[data-stage="sealed"] .shape--sealed,
.trail[data-stage="parcel"] .shape--parcel,
.trail[data-stage="plane"] .shape--plane {
  opacity: 1;
  scale: 1;
}

/* inside a shape everything follows --p, how far the reader is into that stretch of the page */
.spin,
.rock,
.fly,
.piece {
  transform-origin: 24px 24px;
}
.spin {
  rotate: calc(-14deg + var(--p) * 28deg);
}
.piece--a {
  translate: calc((1 - var(--p)) * -16px) calc((1 - var(--p)) * -8px);
  rotate: calc((1 - var(--p)) * -30deg - 6deg);
}
.piece--b {
  translate: calc((1 - var(--p)) * 16px) calc((1 - var(--p)) * -12px);
  rotate: calc((1 - var(--p)) * 40deg + 7deg);
}
.piece--c {
  translate: 0 calc((1 - var(--p)) * 16px);
  rotate: calc((1 - var(--p)) * 20deg);
}
.drop {
  translate: 0 calc(var(--p) * 22px);
}
.rock {
  rotate: calc((0.5 - var(--p)) * 16deg);
}
.tape {
  transform-box: fill-box;
  transform-origin: top;
  scale: 1 var(--p);
}
.string {
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - var(--p));
}
.label {
  transform-box: fill-box;
  transform-origin: center;
  opacity: calc(var(--p) * 3);
  scale: calc(2.4 - min(1, var(--p) * 2) * 1.4);
}
.stamp {
  opacity: calc(var(--p) * 3 - 1.5);
}
.fly {
  translate: calc(var(--p) * 10px) calc(var(--p) * -8px);
  rotate: calc(var(--p) * -12deg);
}
.wind {
  opacity: calc(1 - var(--p));
}

/* the plane arrives at the demo request */
.is-landed .trail__art {
  animation: trail-land 0.9s cubic-bezier(0.3, 1.4, 0.5, 1) forwards;
}
@keyframes trail-land {
  40% {
    translate: 36px -26px;
    scale: 1.5;
    rotate: -24deg;
  }
  100% {
    translate: var(--land);
    scale: 1.15;
    rotate: 10deg;
  }
}
</style>
