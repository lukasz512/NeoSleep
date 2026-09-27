<template>
  <div
    class="app-segment-progress"
    role="progressbar"
    :aria-valuenow="doneCount"
    aria-valuemin="0"
    :aria-valuemax="segments.length"
    :aria-valuetext="ariaLabel ?? label"
    :aria-label="ariaLabel ?? label"
  >
    <div v-if="label || meta" class="app-segment-progress__label">
      <span class="app-segment-progress__text">{{ label }}</span>
      <span v-if="meta" class="app-segment-progress__meta">{{ meta }}</span>
    </div>
    <div class="app-segment-progress__track" aria-hidden="true">
      <span
        v-for="(state, i) in segments"
        :key="i"
        class="app-segment-progress__segment"
        :class="`app-segment-progress__segment--${state}`"
        data-testid="app-segment-progress-segment"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * NEO-127: the one progress bar of the app — one segment per item/step, so
 * *which* one is missing reads at a glance, not just how many. Colours match
 * ChecklistStatusIcon (green done · striped amber waiting · half amber partial
 * · grey todo); `current` is the step the patient is on (brand colour). Full
 * width of its container — the caller decides any cap. The text label carries
 * the meaning, colour never alone.
 */
export type SegmentState = "done" | "waiting" | "partial" | "current" | "todo";

const props = defineProps<{
  segments: SegmentState[];
  /** Main line above the bar, e.g. "1 of 6 done" / "Step 2 of 3". */
  label?: string;
  /** Muted text right of the label, e.g. "2 waiting" / the step's title. */
  meta?: string;
  /** Screen-reader text when there's no visible label. */
  ariaLabel?: string;
}>();

const doneCount = computed(() => props.segments.filter((s) => s === "done").length);
</script>

<style scoped>
.app-segment-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.app-segment-progress__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.app-segment-progress__text {
  font-weight: 600;
}

.app-segment-progress__meta {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-segment-progress__track {
  display: flex;
  gap: 4px;
}

.app-segment-progress__segment {
  flex: 1 1 0;
  height: 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  transition: background 0.3s ease;
}

.app-segment-progress__segment--done {
  background: rgb(var(--v-theme-success));
}

.app-segment-progress__segment--current {
  background: rgb(var(--v-theme-primary));
}

.app-segment-progress__segment--waiting {
  background: repeating-linear-gradient(
    -45deg,
    rgb(var(--v-theme-warning)) 0 4px,
    rgba(var(--v-theme-warning), 0.35) 4px 8px
  );
}

.app-segment-progress__segment--partial {
  background: linear-gradient(90deg, rgb(var(--v-theme-warning)) 50%, rgba(var(--v-theme-on-surface), 0.12) 50%);
}

@media (prefers-reduced-motion: reduce) {
  .app-segment-progress__segment {
    transition: none;
  }
}
</style>
