<!-- The page's moving decoration, in the form the reader's browser can take (CORE-215 rounds 7 to 10):
     live  = the dot paper on a canvas plus the 3D parcel (paper.ts),
     flat  = the round 6 object in the margin (no WebGL, or a data saver),
     still = nothing at all (reduced motion); the page keeps its printed dot grid.
     Decoration only: hidden from screen readers, nothing to focus, and it never takes the pointer. -->
<template>
  <ScrollTrail v-if="mode === 'flat'" />
  <div v-else-if="mode === 'live'" ref="paper" class="paper" :class="{ 'is-over': over }" aria-hidden="true">
    <canvas ref="dots" class="paper__dots"></canvas>
    <canvas ref="gl" class="paper__gl"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import ScrollTrail from "./ScrollTrail.vue";
import { startPaper } from "./paper";
import { trailMode } from "./trail";

const emit = defineEmits<{ land: [on: boolean] }>();

// asked once, like the theme: what this reader's browser wants and can do
const mode = ref(
  trailMode({
    reduced: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true,
    webgl: typeof WebGLRenderingContext !== "undefined",
  }),
);
const paper = ref<HTMLElement | null>(null);
const dots = ref<HTMLCanvasElement | null>(null);
const gl = ref<HTMLCanvasElement | null>(null);
const over = ref(false);
let stop = () => {};

/** The canvas draws the dots now, so the page's printed dot grid steps back (neocrm.css). */
const LIVE = "ncrm-live";

function flat() {
  stop();
  stop = () => {};
  document.documentElement.classList.remove(LIVE);
  emit("land", false);
  mode.value = "flat";
}

onMounted(() => {
  const root = paper.value?.parentElement;
  if (mode.value !== "live" || !root || !dots.value || !gl.value) return;
  document.documentElement.classList.add(LIVE);
  stop = startPaper({
    root,
    dots: dots.value,
    gl: gl.value,
    tiles: ".lens, .fig, .item",
    over: (on) => (over.value = on),
    land: (on) => emit("land", on),
    fail: flat,
  });
});
onBeforeUnmount(() => {
  stop();
  document.documentElement.classList.remove(LIVE);
});
</script>

<style scoped>
/* behind the page's content and above its background, so the glass tiles have something to blur */
.paper__dots,
.paper__gl {
  position: fixed;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
/* on a phone's margin, and while the plane flies to the button, the parcel is in front */
.is-over .paper__gl {
  z-index: 5;
}
</style>
