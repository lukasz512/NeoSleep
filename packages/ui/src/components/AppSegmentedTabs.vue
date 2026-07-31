<template>
  <div class="app-segmented-tabs" role="tablist">
    <div
      class="app-segmented-tabs__thumb"
      :style="{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${activeIndex * 100}%)` }"
      aria-hidden="true"
    />
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="app-segmented-tabs__tab"
      :class="{ 'app-segmented-tabs__tab--active': option.value === modelValue }"
      :aria-selected="option.value === modelValue"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * Shared segmented/joined tab control — one pill-shaped glass container with
 * a single sliding indicator, not per-segment background swaps (see
 * apps/pwa's older VBtnToggle-based pattern in PlannerView.vue, which this
 * is meant to eventually replace there too). Native-iOS-inspired: this is
 * the shared building block for that everywhere a connected tab switcher is
 * needed, not a one-off per view.
 */
export interface AppSegmentedTabOption {
  value: string;
  label: string;
}

const props = defineProps<{
  modelValue: string;
  options: AppSegmentedTabOption[];
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();

const activeIndex = computed(() => Math.max(0, props.options.findIndex((o) => o.value === props.modelValue)));
</script>

<style scoped>
.app-segmented-tabs {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 4px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.75);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.app-segmented-tabs__thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 2px 8px rgba(var(--v-theme-primary), 0.35);
  transition: transform 420ms var(--pwa-ease-spring, cubic-bezier(0.34, 1.2, 0.64, 1));
  will-change: transform;
}

.app-segmented-tabs__tab {
  position: relative;
  z-index: 1;
  appearance: none;
  border: none;
  background: transparent;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  transition: color 220ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
}

.app-segmented-tabs__tab--active {
  color: rgb(var(--v-theme-on-primary));
}

.app-segmented-tabs__tab:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
