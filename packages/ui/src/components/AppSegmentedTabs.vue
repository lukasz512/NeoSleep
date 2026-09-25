<template>
  <div
    ref="rootEl"
    class="app-segmented-tabs position-relative d-flex pa-2 pa-sm-1 rounded-pill"
    :class="{ 'app-segmented-tabs--compact': compact, 'app-segmented-tabs--fit': fit }"
    role="tablist"
  >
    <div
      class="app-segmented-tabs__thumb position-absolute rounded-pill bg-primary"
      :style="thumbStyle"
      aria-hidden="true"
    />
    <VBtn
      v-for="option in options"
      :key="option.value"
      variant="text"
      size="small"
      role="tab"
      class="app-segmented-tabs__tab position-relative text-body-medium font-weight-medium"
      :class="{ 'app-segmented-tabs__tab--active': option.value === modelValue, 'flex-grow-1': !fit }"
      :aria-selected="option.value === modelValue"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { VBtn } from "vuetify/components";

/**
 * Shared segmented/joined tab control — one pill-shaped glass container with
 * a single sliding indicator, not per-segment background swaps (see
 * apps/pwa's older VBtnToggle-based pattern in PlannerView.vue, which this
 * is meant to eventually replace there too). Native-iOS-inspired: this is
 * the shared building block for that everywhere a connected tab switcher is
 * needed, not a one-off per view.
 *
 * Two layouts: equal columns filling the row (default — e.g. ResourcesView's
 * full-width switcher), or `fit`, where each tab takes its label's own width
 * and the bar hugs its tabs (NEO-61 — detail views, where a label such as
 * "Historia endo" must never be ellipsized). Either way the thumb is placed
 * from the active tab's measured box, so it matches both layouts.
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
  /** Tabs take their label's width instead of equal columns; the bar is only as wide as its tabs. */
  fit?: boolean;
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();

const activeIndex = computed(() => Math.max(0, props.options.findIndex((o) => o.value === props.modelValue)));

const rootEl = ref<HTMLElement | null>(null);
/** Active tab's box inside the container (offsetLeft already includes --seg-pad); null until measured. */
const activeBox = ref<{ left: number; width: number } | null>(null);

function measure(): void {
  const tab = rootEl.value?.querySelectorAll<HTMLElement>(".app-segmented-tabs__tab")[activeIndex.value];
  if (!tab || tab.offsetWidth === 0) return;
  activeBox.value = { left: tab.offsetLeft, width: tab.offsetWidth };
}

// Until the first measurement (and in jsdom, which has no layout) the
// equal-column math is used — exact for the default layout.
const thumbStyle = computed(() =>
  activeBox.value
    ? { left: "0", width: `${activeBox.value.width}px`, transform: `translateX(${activeBox.value.left}px)` }
    : {
        width: `calc((100% - var(--seg-pad) * 2) / ${props.options.length})`,
        transform: `translateX(${activeIndex.value * 100}%)`,
      },
);

let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && rootEl.value) {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(rootEl.value);
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());
watch(
  () => [props.modelValue, props.options, props.fit, props.compact],
  () => void nextTick(measure),
  { deep: true },
);
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
  transition:
    transform 420ms var(--pwa-ease-spring, cubic-bezier(0.34, 1.2, 0.64, 1)),
    width 420ms var(--pwa-ease-spring, cubic-bezier(0.34, 1.2, 0.64, 1));
  will-change: transform;
  pointer-events: none;
}

.app-segmented-tabs__tab {
  z-index: 1;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-transform: none;
  /* Tracking comes from the text-body-medium utility class. Vuetify 4 puts
     utilities in a cascade layer, so any letter-spacing here would now
     override it (it never did under Vuetify 3's !important utilities). */
  /* Vuetify's flex-grow-1 utility only sets flex-grow — flex-basis stays
     auto, so a long label (e.g. "Estudios de sueño") keeps its content
     width and steals space from neighbors instead of sharing the row
     equally. The sliding thumb above is positioned by equal-interval math
     (activeIndex * 100% / options.length), so any segment that isn't
     actually equal-width reads as visually overlapping the thumb/adjacent
     label. flex-basis: 0 forces true equal columns regardless of content;
     min-width: 0 is required alongside it for the ellipsis rule below to
     be able to shrink a flex child below its content size at all. */
  flex-basis: 0;
  min-width: 0;
}

/* fit (NEO-61): each tab is its label's width and never ellipsized; the bar
   hugs its tabs. min-width stops a short label ("Notes") reading as a sliver
   next to a long one. Declared after the equal-column rule above so it wins. */
.app-segmented-tabs--fit {
  width: max-content;
  max-width: 100%;
  /* A narrow tablet can't always fit every label: scroll, never ellipsize. */
  overflow-x: auto;
  scrollbar-width: none;
}
.app-segmented-tabs--fit::-webkit-scrollbar {
  display: none;
}
.app-segmented-tabs--fit .app-segmented-tabs__tab {
  flex: 0 0 auto;
  min-width: 88px;
}

.app-segmented-tabs__tab :deep(.v-btn__content) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  display: block;
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
