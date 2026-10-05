<template>
  <figure class="dp-donut" :class="{ 'dp-donut--drawn': drawn }" data-testid="doctor-panel-donut">
    <div class="dp-donut__stage">
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
            '--seg-color': seg.color,
            strokeDasharray: `${drawn ? seg.length : 0} ${CIRCUMFERENCE}`,
            strokeDashoffset: `${-seg.offset}`,
            transitionDelay: `${drawn ? SEGMENT_START_MS + i * STAGGER_MS : (segments.length - 1 - i) * 40}ms`,
          }"
          data-testid="doctor-panel-donut-seg"
        />
      </svg>
      <div class="dp-donut__centre">
        <b class="dp-donut__total" data-testid="doctor-panel-donut-total">{{ shownTotal }}</b>
        <span class="dp-donut__caption">{{ caption }}</span>
      </div>
    </div>
    <ul class="dp-donut__legend">
      <li
        v-for="(seg, i) in legend"
        :key="seg.key"
        :style="{ transitionDelay: `${drawn ? LEGEND_START_MS + i * 90 : 0}ms` }"
        data-testid="doctor-panel-donut-legend"
      >
        <span class="dp-donut__swatch" :style="{ background: seg.color }" aria-hidden="true" />
        <span class="dp-donut__label">{{ seg.label }}</span>
        <b class="dp-donut__value">{{ seg.value }}</b>
      </li>
    </ul>
  </figure>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { useCountUp } from "../../composables/useCountUp";

/**
 * Part-of-whole ring for the Doctor Panel (NEO-233, NEO-238). `drawn` drives the motion:
 * the ring swings in while its segments draw one after another with a soft glow, the
 * centre counts up and the legend follows; when `drawn` turns off it all folds back.
 * Reduced-motion users get the final state without movement.
 */
export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const props = defineProps<{ slices: DonutSlice[]; drawn: boolean; caption: string; ariaLabel: string }>();

const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Gap between segments along the ring, so neighbours read as separate. */
const GAP = 3;
const STAGGER_MS = 140;
/** NEO-239: the ring spins in for ~1.6 s; segments start once it is turning, the legend after. */
const SEGMENT_START_MS = 250;
const LEGEND_START_MS = 900;

const total = computed(() => props.slices.reduce((sum, s) => sum + s.value, 0));
const shownTotal = useCountUp(total, 1600, toRef(props, "drawn"), 300);
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
  justify-content: center;
  gap: var(--space-4);
  margin: 0;
}

.dp-donut__stage {
  position: relative;
  flex: none;
  width: 176px;
  height: 176px;
}

.dp-donut__chart {
  width: 100%;
  height: 100%;
  overflow: visible;
  /* The ring swings in from a quarter turn back while it draws; segments start at 12 o'clock. */
  transform: rotate(-330deg) scale(0.8);
  opacity: 0.4;
  transition:
    transform 1.6s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.6s ease;
}

.dp-donut--drawn .dp-donut__chart {
  transform: rotate(-90deg) scale(1);
  opacity: 1;
}

.dp-donut__track,
.dp-donut__seg {
  fill: none;
  stroke-width: 13;
}

.dp-donut__track {
  stroke: rgba(var(--v-theme-on-surface), 0.07);
}

.dp-donut__seg {
  stroke: var(--seg-color);
  stroke-linecap: round;
  filter: drop-shadow(0 0 0 transparent);
  /* A zero-length dash with round caps still paints a dot; hidden until it draws. */
  opacity: 0;
  transition:
    stroke-dasharray 1.3s cubic-bezier(0.34, 1.15, 0.64, 1),
    filter 1.3s ease,
    opacity 0.2s ease;
}

.dp-donut--drawn .dp-donut__seg {
  opacity: 1;
  filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--seg-color) 55%, transparent));
}

.dp-donut__centre {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  pointer-events: none;
}

.dp-donut__total {
  font-size: 2.25rem;
  font-weight: 650;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.dp-donut__caption {
  margin-top: 4px;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dp-donut__legend {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 170px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dp-donut__legend li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 26px;
  font-size: 0.8125rem;
  opacity: 0;
  transform: translateX(8px);
  transition:
    opacity 0.4s ease,
    transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.dp-donut--drawn .dp-donut__legend li {
  opacity: 1;
  transform: none;
}

.dp-donut__swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dp-donut__label {
  flex: 1;
}

.dp-donut__value {
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .dp-donut__chart,
  .dp-donut__seg,
  .dp-donut__legend li {
    transition: none;
  }
}
</style>
