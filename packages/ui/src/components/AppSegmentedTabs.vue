<template>
  <div
    class="app-segmented-tabs position-relative d-flex pa-2 pa-sm-1 rounded-pill"
    :class="{ 'app-segmented-tabs--compact': compact }"
    role="tablist"
  >
    <div
      class="app-segmented-tabs__thumb position-absolute rounded-pill bg-primary"
      :style="{ width: `calc((100% - var(--seg-pad) * 2) / ${options.length})`, transform: `translateX(${activeIndex * 100}%)` }"
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
  /** Shrinks to exactly the desktop-sized control (same padding + tab height, not an approximation) — e.g. while the caller's content scrolls, iOS-large-title-style. No-op on desktop, which already renders at that size. */
  compact?: boolean;
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();

const activeIndex = computed(() => Math.max(0, props.options.findIndex((o) => o.value === props.modelValue)));
</script>

<style scoped>
/* Glass effect: no Vuetify utility for backdrop-filter — same vocabulary as AuthChrome.vue's pill chrome. */
.app-segmented-tabs {
  --seg-pad: 8px; /* matches the pa-2 utility in the template — kept in sync manually, see below */
  background: rgba(var(--v-theme-surface), 0.75);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
@media (min-width: 600px) {
  .app-segmented-tabs {
    --seg-pad: 4px; /* matches the pa-sm-1 utility in the template */
  }
}

/* Compact: sets the exact same padding desktop already uses (4px), not an
   approximation like a scale transform — per feedback, "shrink to the
   height that exists on desktop" is a literal spec, not "shrink somewhat".
   !important is required here because Vuetify's own pa-2/pa-sm-1 utility
   classes in the template set `padding` with !important — a plain override
   would lose to those regardless of selector specificity. Real `padding`
   transitions natively; no Houdini/@property needed like a custom property
   transition would require. */
.app-segmented-tabs {
  transition: padding 280ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
}
.app-segmented-tabs--compact {
  --seg-pad: 4px;
  padding: 4px !important;
}

/* Thumb position/slide: absolute-position coordinates and a transition
   timing function aren't utility-class-expressible. Insets track --seg-pad
   (set above from the container's own responsive padding utility classes)
   because an absolutely positioned child's containing block is the padding
   *edge*, not the content edge, so it doesn't inherit that inset for free. */
.app-segmented-tabs__thumb {
  top: var(--seg-pad);
  bottom: var(--seg-pad);
  left: var(--seg-pad);
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

/* VBtn's "small" height (32px) reads as visually thin/cramped as a
   full-width mobile control — bumped on mobile only, where it's held and
   tapped rather than clicked with a mouse. 40px rather than the full 44px
   touch-target minimum per feedback (44px read as too tall here); desktop
   stays compact by design. No Vuetify utility sets an explicit min-height.
   Compact reverts this to VBtn's own natural (unset) height — the same
   32px desktop already has, not a separate hand-picked number. */
@media (max-width: 599px) {
  .app-segmented-tabs__tab {
    min-height: 40px;
    transition: min-height 280ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
  }
  .app-segmented-tabs--compact .app-segmented-tabs__tab {
    min-height: 32px;
  }
}
</style>
