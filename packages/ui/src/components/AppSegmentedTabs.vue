<template>
  <div class="app-segmented-tabs position-relative d-flex pa-1 rounded-pill" role="tablist">
    <div
      class="app-segmented-tabs__thumb position-absolute rounded-pill bg-primary"
      :style="{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${activeIndex * 100}%)` }"
      aria-hidden="true"
    />
    <VBtn
      v-for="option in options"
      :key="option.value"
      variant="text"
      size="small"
      role="tab"
      class="app-segmented-tabs__tab position-relative flex-grow-1 text-body-2 font-weight-medium"
      :class="{ 'app-segmented-tabs__tab--active': option.value === modelValue }"
      :aria-selected="option.value === modelValue"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { VBtn } from "vuetify/components";

/**
 * Shared segmented/joined tab control — one pill-shaped glass container with
 * a single sliding indicator, not per-segment background swaps (see
 * apps/pwa's older VBtnToggle-based pattern in PlannerView.vue, which this
 * is meant to eventually replace there too). Native-iOS-inspired: this is
 * the shared building block for that everywhere a connected tab switcher is
 * needed, not a one-off per view.
 *
 * Layout/spacing/typography use Vuetify utility classes per
 * docs/foundation/DESIGN_AND_UI.md's utility-first convention — only the
 * glass background (backdrop-filter) and the thumb's slide animation stay
 * as scoped CSS, since neither has a utility-class equivalent.
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
/* Glass effect: no Vuetify utility for backdrop-filter — same vocabulary as AuthChrome.vue's pill chrome. */
.app-segmented-tabs {
  background: rgba(var(--v-theme-surface), 0.75);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

/* Thumb position/slide: absolute-position coordinates and a transition timing function aren't utility-class-expressible. */
.app-segmented-tabs__thumb {
  top: 4px;
  bottom: 4px;
  left: 4px;
  box-shadow: 0 2px 8px rgba(var(--v-theme-primary), 0.35);
  transition: transform 420ms var(--pwa-ease-spring, cubic-bezier(0.34, 1.2, 0.64, 1));
  will-change: transform;
  pointer-events: none;
}

.app-segmented-tabs__tab {
  z-index: 1;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-transform: none;
  letter-spacing: normal;
}

.app-segmented-tabs__tab--active {
  color: rgb(var(--v-theme-on-primary));
}

.app-segmented-tabs__tab :deep(.v-btn__overlay) {
  display: none;
}
</style>
