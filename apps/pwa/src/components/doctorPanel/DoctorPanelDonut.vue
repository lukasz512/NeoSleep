<template>
  <figure class="dp-donut" :class="{ 'dp-donut--drawn': drawn }" data-testid="doctor-panel-donut">
    <svg viewBox="0 0 120 120" class="dp-donut__chart" role="img" :aria-label="ariaLabel">
      <circle cx="60" cy="60" :r="RADIUS" class="dp-donut__track" />
      <circle
        v-for="(seg, i) in segments"
        :key="seg.key"
        cx="60"
        cy="60"
        :r="RADIUS"
        class="dp-donut__seg"
        :style="{
          stroke: seg.color,
          strokeDasharray: `${drawn ? seg.length : 0} ${CIRCUMFERENCE}`,
          strokeDashoffset: `${-seg.offset}`,
          transitionDelay: `${(drawn ? i : segments.length - 1 - i) * STAGGER_MS}ms`,
        }"
        data-testid="doctor-panel-donut-seg"
      />
      <text x="60" y="58" class="dp-donut__total" text-anchor="middle" data-testid="doctor-panel-donut-total">{{ total }}</text>
      <text x="60" y="74" class="dp-donut__caption" text-anchor="middle">{{ caption }}</text>
    </svg>
    <ul class="dp-donut__legend">
      <li v-for="seg in legend" :key="seg.key" data-testid="doctor-panel-donut-legend">
        <span class="dp-donut__swatch" :style="{ background: seg.color }" aria-hidden="true" />
        <span class="dp-donut__label">{{ seg.label }}</span>
        <b class="dp-donut__value">{{ seg.value }}</b>
      </li>
    </ul>
  </figure>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * Part-of-whole ring for the Doctor Panel's "patients by stage" card (NEO-233, Łukasz's D1 note:
 * "a pie chart that animates in and out"). `drawn` drives the animation: the parent flips it on
 * after mount and off before the route leaves; CSS skips it for reduced-motion users.
 */
export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const props = defineProps<{ slices: DonutSlice[]; drawn: boolean; caption: string; ariaLabel: string }>();

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Gap between segments, in user units along the ring, so neighbours read as separate. */
const GAP = 2;
const STAGGER_MS = 70;

const total = computed(() => props.slices.reduce((sum, s) => sum + s.value, 0));
const legend = computed(() => props.slices);

const segments = computed(() => {
  let offset = 0;
  const shown = props.slices.filter((s) => s.value > 0);
  const gap = shown.length > 1 ? GAP : 0;
  return shown.map((s) => {
    const full = (s.value / total.value) * CIRCUMFERENCE;
    const seg = { key: s.key, color: s.color, offset, length: Math.max(full - gap, 0.5) };
    offset += full;
    return seg;
  });
});
</script>

<style scoped>
.dp-donut {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  margin: 0;
}

.dp-donut__chart {
  flex: none;
  width: 140px;
  height: 140px;
  /* Segments start at 12 o'clock and run clockwise. */
  transform: rotate(-90deg);
}

.dp-donut__track,
.dp-donut__seg {
  fill: none;
  stroke-width: 14;
}

.dp-donut__track {
  stroke: rgba(var(--v-theme-on-surface), 0.06);
}

.dp-donut__seg {
  transition: stroke-dasharray 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.dp-donut__total,
.dp-donut__caption {
  /* Undo the chart's rotation for the centre text. */
  transform: rotate(90deg);
  transform-origin: 60px 60px;
  fill: rgb(var(--v-theme-on-surface));
}

.dp-donut__total {
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dp-donut__caption {
  font-size: 9px;
  fill: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.dp-donut__legend {
  display: grid;
  flex: 1;
  gap: var(--space-1);
  min-width: 160px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dp-donut__legend li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 28px;
  font-size: 0.875rem;
}

.dp-donut__swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.dp-donut__label {
  flex: 1;
}

.dp-donut__value {
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .dp-donut__seg {
    transition: none;
  }
}
</style>
