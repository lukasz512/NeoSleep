<!-- Renders headline markup from the locale files: [word] → the pen-written word, ~phrase~ → the
     marker stroke. Once the heading is in view the pen writes the word, then the marker is drawn,
     one after the other, on a clock (lib/motion penTiming), so neither is ever left half done.
     Each marked phrase gets its own stroke (angle, weight, chisel ends: markerVariant). Lite: at rest. -->
<template>
  <span ref="root" class="accent" :style="{ '--write': write, '--draw': draw }">
    <template v-for="(g, i) in groups" :key="i">
      <span v-if="g.mk" class="mk" :class="`mk--${variant}`">
        <template v-for="(s, j) in g.parts" :key="j">
          <span v-if="s.acc" class="acc">{{ s.text }}</span>
          <template v-else>{{ s.text }}</template>
        </template>
      </span>
      <template v-else>
        <template v-for="(s, j) in g.parts" :key="j">
          <span v-if="s.acc" class="acc">{{ s.text }}</span>
          <template v-else>{{ s.text }}</template>
        </template>
      </template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { groupAccent, markerVariant } from "../lib/accent";
import { PEN_TOTAL_MS, penTiming } from "../lib/motion";

// `stroke` pins the marker shape (the four partners use 0…3 so each looks different)
const props = defineProps<{ text: string; stroke?: number }>();
const groups = computed(() => groupAccent(props.text));
const variant = computed(() => props.stroke ?? markerVariant(props.text));

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const write = ref(lite ? "1" : "0");
const draw = ref(lite ? "1" : "0");

let io: IntersectionObserver | null = null;
let raf = 0;
function play() {
  const start = performance.now();
  const tick = (now: number) => {
    const t = penTiming(now - start);
    write.value = t.write.toFixed(3);
    draw.value = t.draw.toFixed(3);
    if (now - start < PEN_TOTAL_MS) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

onMounted(() => {
  if (lite) return;
  if (typeof IntersectionObserver === "undefined" || !root.value) {
    write.value = "1";
    draw.value = "1";
    return;
  }
  // starts once the heading is a little way up the screen, plays once
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io?.disconnect();
        play();
      }
    },
    { rootMargin: "0px 0px -15% 0px" },
  );
  io.observe(root.value);
});
onBeforeUnmount(() => {
  io?.disconnect();
  cancelAnimationFrame(raf);
});
</script>
