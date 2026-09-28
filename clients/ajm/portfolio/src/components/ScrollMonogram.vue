<!-- The pause between "Cómo trabajamos" and the clients (O1 = O-A, 2026-09-28): the AJ monogram
     from the client's logo draws itself stroke by stroke as it rises up the screen.
     Round 8 (Łukasz, 2026-09-29): flat and outline only, in the warm muted tone of the page rather
     than black, with little space around it (the 3D extrusion of round 7 is gone).
     Decorative only (aria-hidden). Lite: shown complete and still. -->
<template>
  <div ref="root" class="mono" aria-hidden="true" :style="{ '--draw': draw }">
    <svg class="mono__mark" viewBox="560 163 400 400">
      <path pathLength="1" :d="A" :transform="TA" />
      <path pathLength="1" :d="J" :transform="TJ" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { span01, useScrollProgress } from "../lib/motion";

// The two strokes of the AJ monogram, exactly as in AjLogo.vue (client file logo-white.svg).
const A = "m 0,0 v -159.584 h -15.978 v 138.067 h -2.774 l -94.825,-138.067 h -19.608 L -21.746,0 Z";
const J =
  "m 0,0 v -14.503 -92.686 c 0,-10.017 0,-20.872 -4.051,-30.046 -6.19,-14.482 -21.734,-22.788 -37.291,-22.788 -23.866,0 -41.335,16.403 -42.624,40.266 h 15.568 c 0.843,-15.123 11.915,-25.788 27.27,-25.788 23.225,0 25.565,19.183 25.565,37.728 v 93.314 H -53.061 V 0 h 37.498 z";
const TA = "matrix(1.3333333,0,0,-1.3333333,803.61933,219.06013)";
const TJ = "matrix(1.3333333,0,0,-1.3333333,894.54733,294.25667)";

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const entering = useScrollProgress(root, "enter");
// the outline draws while the mark rises from the bottom of the screen to its middle
const draw = computed(() => (lite ? "1" : span01(entering.value, 0.1, 0.55).toFixed(3)));
</script>

<style scoped>
.mono {
  --size: clamp(120px, 18vw, 220px);
  display: grid;
  place-items: center;
  padding: clamp(8px, 2vh, 24px) 0 0;
}
.mono__mark {
  width: var(--size);
  aspect-ratio: 1;
  overflow: visible;
}
.mono__mark path {
  fill: none;
  stroke: var(--ajm-muted);
  stroke-width: 1.2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - var(--draw, 1));
}
</style>
