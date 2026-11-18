<!-- The page's moving decoration, in the form the reader's browser can take (CORE-215 rounds 7 to 11):
     live  = the dot paper on a canvas plus the 3D parcel and its stars (paper.ts),
     flat  = the round 6 object in the margin (no WebGL, or a data saver),
     still = nothing at all (reduced motion); the page keeps its printed dot grid.
     Decoration only: hidden from screen readers, nothing to focus, and it never takes the pointer. -->
<template>
  <ScrollTrail v-if="mode === 'flat'" />
  <div v-else-if="mode === 'live'" ref="paper" class="paper" :class="{ 'is-over': over }" aria-hidden="true">
    <canvas ref="dots" class="paper__dots"></canvas>
    <canvas ref="gl" class="paper__gl"></canvas>
    <canvas ref="fx" class="paper__fx"></canvas>
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
const fx = ref<HTMLCanvasElement | null>(null);
const over = ref(false);
let stop = () => {};

/** The hero note the parcel's story starts from: a loose note, or the day's last visit once the day is tidy (round 11). */
function source(root: HTMLElement) {
  const stage = root.querySelector(".stage");
  const tidy = !!stage?.classList.contains("is-tidy");
  const el = tidy ? [...root.querySelectorAll<HTMLElement>(".phone__visits .visit")].pop() : root.querySelector<HTMLElement>(".notes .note");
  return el ? { el, keep: tidy } : null;
}
/** The launch step that is lit right now: the parcel hops onto its number. */
function step(root: HTMLElement) {
  const nums = [...root.querySelectorAll<HTMLElement>("#onboarding .path__num")];
  const n = nums.findIndex((num) => num.closest("[aria-current]")?.getAttribute("aria-current") === "step");
  const el = nums[n];
  return el ? { el, n, of: nums.length } : null;
}

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
  if (mode.value !== "live" || !root || !dots.value || !gl.value || !fx.value) return;
  document.documentElement.classList.add(LIVE);
  stop = startPaper({
    root,
    dots: dots.value,
    gl: gl.value,
    fx: fx.value,
    tiles: ".lens, .fig, .item",
    source: () => source(root),
    packing: "#product, #security",
    bounce: "#access .item",
    launch: "#onboarding",
    step: () => step(root),
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
/* stars, the handwritten count and the fan's wind are always in front of the page */
.paper__fx {
  position: fixed;
  inset: 0;
  z-index: 6;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
