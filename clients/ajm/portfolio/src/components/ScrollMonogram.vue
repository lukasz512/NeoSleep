<!-- The pause between "Cómo trabajamos" and the clients (O1 = O-A, 2026-09-28): the AJ monogram
     from the client's logo draws itself stroke by stroke as it rises up the screen, then fills in.
     Decorative only (aria-hidden). Lite: shown complete, no scroll listener. -->
<template>
  <div ref="root" class="mono" aria-hidden="true" :style="{ '--draw': draw, '--fill': fill }">
    <svg viewBox="560 163 400 400">
      <path pathLength="1" :d="A" transform="matrix(1.3333333,0,0,-1.3333333,803.61933,219.06013)" />
      <path pathLength="1" :d="J" transform="matrix(1.3333333,0,0,-1.3333333,894.54733,294.25667)" />
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

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const entering = useScrollProgress(root, "enter");
// outline draws while the mark rises from the bottom to the middle of the screen, then fills
const draw = computed(() => (lite ? "1" : span01(entering.value, 0.1, 0.55).toFixed(3)));
const fill = computed(() => (lite ? "1" : span01(entering.value, 0.55, 0.75).toFixed(3)));
</script>

<style scoped>
.mono {
  display: grid;
  place-items: center;
  padding: clamp(48px, 10vh, 120px) 0;
}
.mono svg {
  width: clamp(120px, 22vw, 260px);
  height: auto;
  overflow: visible;
}
.mono path {
  fill: var(--ajm-ink);
  fill-opacity: var(--fill, 1);
  stroke: var(--ajm-ink);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - var(--draw, 1));
}
</style>
