<template>
  <svg
    class="work-priority-mark"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    :data-priority="priority"
  >
    <template v-if="priority === 1">
      <rect x="1" y="1" width="14" height="14" rx="3.5" :fill="WORK_URGENT_COLOR" />
      <path d="M8 4v5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="8" cy="11.6" r="1" fill="#fff" />
    </template>
    <g v-else-if="lit === 0" fill="currentColor" opacity="0.45" data-none>
      <rect v-for="x in [2, 6.5, 11]" :key="x" :x="x" y="7.25" width="3" height="1.5" rx="0.75" />
    </g>
    <template v-else>
      <rect
        v-for="(bar, index) in BARS"
        :key="bar.x"
        :x="bar.x"
        :y="14 - bar.height"
        width="3"
        :height="bar.height"
        rx="1"
        fill="currentColor"
        :opacity="index < lit ? 1 : 0.22"
        :data-lit="index < lit"
      />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { WORK_URGENT_COLOR, litBars } from "./workGlyphs";

/**
 * A priority as a mark (CORE-225): an orange "!" for urgent, 3 / 2 / 1 lit bars for high /
 * medium / low, three dashes for none. Decorative next to its text; `label` names it alone.
 */
const props = withDefaults(defineProps<{ priority: number; size?: number; label?: string }>(), { size: 16, label: "" });

const BARS = [
  { x: 2, height: 5 },
  { x: 6.5, height: 8.5 },
  { x: 11, height: 12 },
] as const;
const lit = computed(() => litBars(props.priority));
</script>

<style scoped>
.work-priority-mark {
  flex: none;
}
</style>
