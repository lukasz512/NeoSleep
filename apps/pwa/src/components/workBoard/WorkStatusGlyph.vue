<template>
  <svg
    class="work-status-glyph"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    :data-status="status"
    :data-shape="spec.shape"
  >
    <template v-if="spec.shape === 'check' || spec.shape === 'cross'">
      <circle cx="8" cy="8" r="7" :fill="color" />
      <path
        :d="spec.shape === 'check' ? 'M4.8 8.3l2.2 2.2 4.3-4.6' : 'M5.5 5.5l5 5m0-5l-5 5'"
        fill="none"
        stroke="#fff"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
    <template v-else>
      <circle cx="8" cy="8" r="6.25" fill="none" :stroke="color" stroke-width="1.5" :stroke-dasharray="spec.shape === 'dashed' ? '2.4 2.5' : undefined" />
      <circle
        v-if="spec.shape === 'pie'"
        cx="8"
        cy="8"
        r="2"
        fill="none"
        :stroke="color"
        stroke-width="4"
        :stroke-dasharray="pieDash"
        transform="rotate(-90 8 8)"
      />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { workStatusColor, workStatusGlyph } from "./workGlyphs";
import type { WorkStatus } from "../../types/workBoard";

/**
 * A status as a mark (CORE-225). Next to its own text it is decorative; pass `label` where it
 * stands alone and it becomes a named image.
 */
const props = withDefaults(defineProps<{ status: WorkStatus; size?: number; label?: string }>(), { size: 16, label: "" });

const PIE_CIRCUMFERENCE = 2 * Math.PI * 2;
const spec = computed(() => workStatusGlyph(props.status));
const color = computed(() => workStatusColor(props.status));
const pieDash = computed(() => `${((spec.value.fill ?? 0) * PIE_CIRCUMFERENCE).toFixed(2)} ${PIE_CIRCUMFERENCE.toFixed(2)}`);
</script>

<style scoped>
.work-status-glyph {
  flex: none;
}
</style>
