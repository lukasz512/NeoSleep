<!-- The pause between "Cómo trabajamos" and the clients (O1 = O-A, 2026-09-28): the AJ monogram
     from the client's logo draws itself stroke by stroke as it rises up the screen, then fills in.
     Round 7: it is a solid object with depth: the face is extruded by stacked layers in CSS 3D,
     it turns with the scroll, and on a mouse it leans toward the pointer.
     Decorative only (aria-hidden). Lite: shown complete and still, no listeners. -->
<template>
  <div
    ref="root"
    class="mono"
    aria-hidden="true"
    :style="{ '--draw': draw, '--fill': fill, '--rx': `${rx}deg`, '--ry': `${ry}deg` }"
  >
    <div class="mono__stage">
      <svg
        v-for="i in DEPTH"
        :key="i"
        class="mono__layer mono__layer--side"
        viewBox="560 163 400 400"
        :style="{ '--z': i, '--shade': (i / DEPTH).toFixed(3) }"
      >
        <path :d="A" :transform="TA" />
        <path :d="J" :transform="TJ" />
      </svg>
      <svg class="mono__layer mono__layer--face" viewBox="560 163 400 400">
        <path pathLength="1" :d="A" :transform="TA" />
        <path pathLength="1" :d="J" :transform="TJ" />
      </svg>
    </div>
    <div class="mono__shadow" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { span01, useScrollProgress } from "../lib/motion";

// The two strokes of the AJ monogram, exactly as in AjLogo.vue (client file logo-white.svg).
const A = "m 0,0 v -159.584 h -15.978 v 138.067 h -2.774 l -94.825,-138.067 h -19.608 L -21.746,0 Z";
const J =
  "m 0,0 v -14.503 -92.686 c 0,-10.017 0,-20.872 -4.051,-30.046 -6.19,-14.482 -21.734,-22.788 -37.291,-22.788 -23.866,0 -41.335,16.403 -42.624,40.266 h 15.568 c 0.843,-15.123 11.915,-25.788 27.27,-25.788 23.225,0 25.565,19.183 25.565,37.728 v 93.314 H -53.061 V 0 h 37.498 z";
const TA = "matrix(1.3333333,0,0,-1.3333333,803.61933,219.06013)";
const TJ = "matrix(1.3333333,0,0,-1.3333333,894.54733,294.25667)";
/** extrusion layers behind the face */
const DEPTH = 16;

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const entering = useScrollProgress(root, "enter");
// outline draws while the mark rises from the bottom to the middle of the screen, then fills
const draw = computed(() => (lite ? "1" : span01(entering.value, 0.1, 0.55).toFixed(3)));
const fill = computed(() => (lite ? "1" : span01(entering.value, 0.55, 0.75).toFixed(3)));

// Turn: a slow quarter-swing with the scroll (works on touch too), plus a lean toward the mouse.
const rx = ref(lite ? -8 : 0);
const ry = ref(lite ? -18 : 0);
let pointerX = 0;
let pointerY = 0;
let raf = 0;
let visible = false;
let io: IntersectionObserver | null = null;

function onPointer(e: PointerEvent) {
  if (e.pointerType !== "mouse" || !root.value) return;
  const r = root.value.getBoundingClientRect();
  // -1…1 from the mark's centre, so it looks at the cursor wherever the cursor is
  pointerX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
  pointerY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
}
function tick() {
  const scrollTurn = (entering.value - 0.6) * 70; // from about -40° as it enters to face-on mid-screen
  const targetY = scrollTurn + pointerX * 32;
  const targetX = -8 - pointerY * 22;
  ry.value += (targetY - ry.value) * 0.08;
  rx.value += (targetX - rx.value) * 0.08;
  if (visible) raf = requestAnimationFrame(tick);
}

onMounted(() => {
  if (lite || typeof IntersectionObserver === "undefined" || !root.value) return;
  window.addEventListener("pointermove", onPointer, { passive: true });
  io = new IntersectionObserver((entries) => {
    const now = entries.some((e) => e.isIntersecting);
    if (now && !visible) {
      visible = true;
      raf = requestAnimationFrame(tick);
    }
    if (!now) {
      visible = false;
      cancelAnimationFrame(raf);
    }
  });
  io.observe(root.value);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointer);
  io?.disconnect();
  cancelAnimationFrame(raf);
});
</script>

<style scoped>
.mono {
  --size: clamp(140px, 24vw, 280px);
  --step: calc(var(--size) / 180);
  display: grid;
  place-items: center;
  padding: clamp(56px, 12vh, 140px) 0;
  perspective: 900px;
}
.mono__stage {
  position: relative;
  width: var(--size);
  aspect-ratio: 1;
  transform-style: preserve-3d;
  transform: rotateX(var(--rx)) rotateY(var(--ry));
}
.mono__layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
/* the extrusion: the same outline repeated behind the face, darker toward the back, so the
   mark reads as a solid block cut from the ink; it appears as the face fills in */
.mono__layer--side {
  transform: translateZ(calc(var(--z) * var(--step) * -1));
  opacity: var(--fill, 1);
}
.mono__layer--side path {
  fill: color-mix(in srgb, var(--ajm-ink) calc(55% + var(--shade) * 30%), var(--ajm-sand));
}
.mono__layer--face path {
  fill: var(--ajm-ink);
  fill-opacity: var(--fill, 1);
  stroke: var(--ajm-ink);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - var(--draw, 1));
}
/* a soft contact shadow, so the object sits in the page rather than on it */
.mono__shadow {
  width: calc(var(--size) * 0.7);
  height: calc(var(--size) * 0.08);
  margin-top: calc(var(--size) * 0.12);
  border-radius: 50%;
  background: color-mix(in srgb, var(--ajm-ink) 16%, transparent);
  filter: blur(calc(var(--size) * 0.04));
  opacity: var(--fill, 1);
  transform: translateX(calc(var(--ry) * -0.6px));
}
</style>
