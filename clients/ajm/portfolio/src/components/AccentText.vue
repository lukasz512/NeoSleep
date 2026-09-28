<!-- Renders headline markup from the locale files: [word] → Bodoni italic, ~phrase~ → sand marker.
     A marked phrase is one span (one continuous band/hairline), even when it holds the italic word. -->
<template>
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import { groupAccent } from "../lib/accent";

const props = defineProps<{ text: string }>();
const groups = computed(() => groupAccent(props.text));
</script>
