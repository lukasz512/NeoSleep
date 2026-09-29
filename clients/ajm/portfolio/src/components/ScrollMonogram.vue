<!-- The pause between "Cómo trabajamos" and the clients (O1 = O-A, 2026-09-28): the AJ monogram
     from the client's logo, drawn like a Leonardo sketch as it rises up the screen (round 8,
     Łukasz 2026-09-29): pencil construction lines (circle, square, diagonals) first, then the outline,
     then pencil hatching, and finally it is coloured in solid black. The grain comes from a light
     turbulence filter, so the lines look drawn, not ruled. On a mouse the mark is pulled toward the
     pointer like a magnet (lib/magnet.ts). Decorative only (aria-hidden). Lite: finished and still. -->
<template>
  <div
    ref="root"
    class="mono"
    aria-hidden="true"
    :style="{
      '--guide': guide,
      '--draw': draw,
      '--hatch': hatch,
      '--fill': fill,
      '--mx': `${pull.x}px`,
      '--my': `${pull.y}px`,
    }"
  >
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
      <!-- construction, as in a notebook page: a circle, its square and the diagonals -->
      <g class="mono__guides" filter="url(#ajm-pencil)">
        <circle pathLength="1" cx="760" cy="363" r="176" />
        <rect pathLength="1" x="584" y="187" width="352" height="352" />
        <line pathLength="1" x1="584" y1="187" x2="936" y2="539" />
        <line pathLength="1" x1="936" y1="187" x2="584" y2="539" />
      </g>
      <g filter="url(#ajm-pencil)">
        <path class="mono__hatch" :d="A" :transform="TA" />
        <path class="mono__hatch" :d="J" :transform="TJ" />
        <path class="mono__ink" pathLength="1" :d="A" :transform="TA" />
        <path class="mono__ink" pathLength="1" :d="J" :transform="TJ" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { span01, useScrollProgress } from "../lib/motion";
import { magnetPull } from "../lib/magnet";

// The two strokes of the AJ monogram, exactly as in AjLogo.vue (client file logo-white.svg).
const A = "m 0,0 v -159.584 h -15.978 v 138.067 h -2.774 l -94.825,-138.067 h -19.608 L -21.746,0 Z";
const J =
  "m 0,0 v -14.503 -92.686 c 0,-10.017 0,-20.872 -4.051,-30.046 -6.19,-14.482 -21.734,-22.788 -37.291,-22.788 -23.866,0 -41.335,16.403 -42.624,40.266 h 15.568 c 0.843,-15.123 11.915,-25.788 27.27,-25.788 23.225,0 25.565,19.183 25.565,37.728 v 93.314 H -53.061 V 0 h 37.498 z";
const TA = "matrix(1.3333333,0,0,-1.3333333,803.61933,219.06013)";
const TJ = "matrix(1.3333333,0,0,-1.3333333,894.54733,294.25667)";

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const entering = useScrollProgress(root, "enter");
// scroll stages while the mark rises from the bottom of the screen to just above its middle
const stage = (a: number, b: number) => computed(() => (lite ? "1" : span01(entering.value, a, b).toFixed(3)));
const guide = stage(0.05, 0.35);
const draw = stage(0.2, 0.5);
const hatch = stage(0.45, 0.65);
const fill = stage(0.62, 0.8);

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
.mono {
  --size: clamp(140px, 20vw, 240px);
  display: grid;
  place-items: center;
  padding: clamp(8px, 2vh, 24px) 0 0;
}
.mono__mark {
  width: var(--size);
  aspect-ratio: 1;
  overflow: visible;
  transform: translate3d(var(--mx, 0), var(--my, 0), 0);
}
/* pencil construction lines, faint, drawn first */
.mono__guides > * {
  fill: none;
  stroke: var(--ajm-muted);
  stroke-width: 0.8;
  stroke-opacity: 0.45;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - var(--guide, 1));
}
/* the outline, in pencil, darkening to ink as it is coloured in */
.mono__ink {
  fill: var(--ajm-ink);
  fill-opacity: var(--fill, 1);
  stroke: var(--ajm-ink);
  stroke-width: 1.2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
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
