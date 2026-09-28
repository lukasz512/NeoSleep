<!-- Renders headline markup from the locale files: [word] → the pen-written word, ~phrase~ → the
     hand-drawn sand stroke. Both are tied to scroll: as the heading comes up the screen the word
     writes itself, then the stroke is drawn under the phrase (lib/motion penTiming). Lite: at rest. -->
<template>
  <span ref="root" class="accent" :style="{ '--write': write, '--draw': draw }">
    <template v-for="(g, i) in groups" :key="i">
      <span v-if="g.mk" class="mk">
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
import { computed, ref } from "vue";
import { groupAccent } from "../lib/accent";
import { penTiming, useScrollProgress } from "../lib/motion";

const props = defineProps<{ text: string }>();
const groups = computed(() => groupAccent(props.text));

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const entering = useScrollProgress(root, "enter");
const timing = computed(() => (lite ? { write: 1, draw: 1 } : penTiming(entering.value)));
const write = computed(() => timing.value.write.toFixed(3));
const draw = computed(() => timing.value.draw.toFixed(3));
</script>
