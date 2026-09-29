<!-- The pause between "Cómo trabajamos" and the clients (O1 = O-A, 2026-09-28): the AJ monogram
     from the client's logo, drawn like a Leonardo sketch (round 8, Łukasz 2026-09-29). The page stops
     on it for about two scroll swipes (lib/monogram.ts) and that scroll draws it: construction lines,
     outline, pencil hatching, solid black; then the construction lines fade and the page moves on.
     The blueprint starts very large and closes in to its size while the outline is drawn. The grain comes from a light
     turbulence filter, so the lines look drawn, not ruled. On a mouse the mark is pulled toward the
     pointer like a magnet (lib/magnet.ts). Decorative only (aria-hidden). Lite: finished and still. -->
<template>
  <div
    ref="root"
    class="mono"
    :class="{ 'mono--pinned': !lite }"
    aria-hidden="true"
    :style="{
      '--pin': MONO_PIN_SCREENS,
      '--guides-out': st.guidesOut,
      '--zoom': st.zoom.toFixed(3),
      '--guide': guide,
      '--draw': draw,
      '--hatch': hatch,
      '--fill': fill,
      '--mx': `${pull.x}px`,
      '--my': `${pull.y}px`,
    }"
  >
    <div class="mono__stage">
    <svg class="mono__mark" viewBox="560 163 400 400">
      <defs>
        <filter id="ajm-pencil" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.4" />
        </filter>
        <pattern id="ajm-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="7" class="mono__hatchline" />
        </pattern>
      </defs>
      <!-- construction, as in a Leonardo notebook: the letters inscribed in a circle with its square,
           and every line the letters are built on carried on past them (GUIDES below) -->
      <g class="mono__guides" filter="url(#ajm-pencil)">
        <path v-for="(d, i) in GUIDES" :key="i" pathLength="1" :d="d" :style="{ '--i': i }" />
      </g>
      <g filter="url(#ajm-pencil)">
        <path class="mono__hatch" :d="A" :transform="TA" />
        <path class="mono__hatch" :d="J" :transform="TJ" />
        <path class="mono__ink" pathLength="1" :d="A" :transform="TA" />
        <path class="mono__ink" pathLength="1" :d="J" :transform="TJ" />
      </g>
    </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useScrollProgress } from "../lib/motion";
import { magnetPull } from "../lib/magnet";
import { MONO_PIN_SCREENS, monoStages } from "../lib/monogram";

// The two strokes of the AJ monogram, exactly as in AjLogo.vue (client file logo-white.svg).
const A = "m 0,0 v -159.584 h -15.978 v 138.067 h -2.774 l -94.825,-138.067 h -19.608 L -21.746,0 Z";
const J =
  "m 0,0 v -14.503 -92.686 c 0,-10.017 0,-20.872 -4.051,-30.046 -6.19,-14.482 -21.734,-22.788 -37.291,-22.788 -23.866,0 -41.335,16.403 -42.624,40.266 h 15.568 c 0.843,-15.123 11.915,-25.788 27.27,-25.788 23.225,0 25.565,19.183 25.565,37.728 v 93.314 H -53.061 V 0 h 37.498 z";
const TA = "matrix(1.3333333,0,0,-1.3333333,803.61933,219.06013)";
const TJ = "matrix(1.3333333,0,0,-1.3333333,894.54733,294.25667)";

/**
 * The sketch's construction, in the viewBox's units. Key points of the letters (from A/J above):
 * A apex 774.6,219.1 · A foot 626,431.8 · A inner foot 652.2,431.8 / inner top 778.6,247.7 ·
 * A stem x 782.3–803.6 · baseline y 431.8 · J top bar y 294.3 (x 823.8–894.5) · J bowl ≈ 838.6,440.
 * The circle holds the letters (centre 760,363, r 200); its inscribed square is their bounding box.
 */
const C = { x: 760, y: 363, r: 200 };
const SQ = C.r / Math.SQRT2;
const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;
const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
/** extend the segment p→q by `a` of its length before p and `b` after q */
const ext = (px: number, py: number, qx: number, qy: number, a: number, b: number) =>
  line(px - (qx - px) * a, py - (qy - py) * a, qx + (qx - px) * b, qy + (qy - py) * b);
const GUIDES = [
  circle(C.x, C.y, C.r),
  `M ${C.x - SQ} ${C.y - SQ} h ${2 * SQ} v ${2 * SQ} h ${-2 * SQ} Z`,
  line(C.x - SQ, C.y - SQ, C.x + SQ, C.y + SQ),
  line(C.x + SQ, C.y - SQ, C.x - SQ, C.y + SQ),
  line(C.x, C.y - C.r - 14, C.x, C.y + C.r + 14),
  line(C.x - C.r - 14, C.y, C.x + C.r + 14, C.y),
  // the A: both diagonals carried past the apex and the foot
  ext(626, 431.8, 774.6, 219.1, 0.45, 0.38),
  ext(652.2, 431.8, 778.6, 247.7, 0.5, 0.55),
  // stems and bars as long pencil rules
  line(803.6, 150, 803.6, 578),
  line(782.3, 170, 782.3, 560),
  line(894.5, 170, 894.5, 560),
  line(548, 219.1, 972, 219.1),
  line(560, 294.3, 960, 294.3),
  line(548, 431.8, 972, 431.8),
  // the J's bowl, compassed
  circle(838.6, 440, 56),
  circle(838.6, 440, 35),
  // a compass arc from the A's foot through its apex
  "M 626 172.2 A 259.6 259.6 0 0 1 885.6 431.8",
];

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const through = useScrollProgress(root);
// lite: the finished mark, still; otherwise every stage follows the scroll through the pinned stretch
const st = computed(() => monoStages(lite ? 1 : through.value));
const guide = computed(() => st.value.guide.toFixed(3));
const draw = computed(() => st.value.draw.toFixed(3));
const hatch = computed(() => st.value.hatch.toFixed(3));
const fill = computed(() => st.value.fill.toFixed(3));

// Magnet: ease toward the pull for the current pointer position, back to rest when it leaves.
const pull = reactive({ x: 0, y: 0 });
let target = { x: 0, y: 0 };
let raf = 0;
function onPointer(e: PointerEvent) {
  if (e.pointerType !== "mouse" || !root.value) return;
  const svg = root.value.firstElementChild as Element | null;
  const r = (svg ?? root.value).getBoundingClientRect();
  target = magnetPull(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  pull.x += (target.x - pull.x) * 0.12;
  pull.y += (target.y - pull.y) * 0.12;
  const settled = Math.abs(target.x - pull.x) < 0.1 && Math.abs(target.y - pull.y) < 0.1;
  raf = settled ? 0 : requestAnimationFrame(tick);
}
onMounted(() => {
  if (!lite) window.addEventListener("pointermove", onPointer, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointer);
  cancelAnimationFrame(raf);
});
</script>

<style scoped>
/* the stage is a full screen held while the sketch draws; the mark and its construction fill
   most of it, with air above and below */
.mono {
  --size: min(58svh, 78vw);
}
.mono--pinned {
  height: calc(100svh * (1 + var(--pin)));
}
.mono__stage {
  display: grid;
  place-items: center;
  height: 100svh;
  overflow: clip;
}
.mono--pinned .mono__stage {
  position: sticky;
  top: 0;
}
.mono__mark {
  width: var(--size);
  aspect-ratio: 1;
  overflow: visible;
  /* round 8: the blueprint starts very large and settles to its size as it is drawn */
  transform: translate3d(var(--mx, 0), var(--my, 0), 0) scale(var(--zoom, 1));
  will-change: transform;
}
/* pencil construction lines, faint, drawn first and one after another */
.mono__guides {
  opacity: calc(1 - var(--guides-out, 0));
}
.mono__guides > * {
  fill: none;
  stroke: var(--ajm-muted);
  stroke-width: 0.6; /* viewBox units: no non-scaling-stroke, which breaks pathLength dashes in Chrome */
  stroke-opacity: 0.45;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - clamp(0, var(--guide, 1) * 2.2 - var(--i) * 0.07, 1));
}
/* the outline, in pencil, darkening to ink as it is coloured in */
.mono__ink {
  fill: var(--ajm-ink);
  fill-opacity: var(--fill, 1);
  stroke: var(--ajm-ink);
  stroke-width: 0.9;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - var(--draw, 1));
}
/* hatching before the solid fill, like shading with a pencil */
.mono__hatch {
  fill: url(#ajm-hatch);
  opacity: var(--hatch, 1);
}
.mono__hatchline {
  stroke: var(--ajm-ink);
  stroke-width: 1.4;
}
</style>
