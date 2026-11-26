<template>
  <div
    ref="rootEl"
    class="app-segmented-tabs position-relative d-flex"
    :class="[
      underline ? 'app-segmented-tabs--underline' : 'app-segmented-tabs--track',
      { 'app-segmented-tabs--compact': compact, 'app-segmented-tabs--fit': fit },
    ]"
    role="tablist"
  >
    <div
      class="app-segmented-tabs__thumb position-absolute"
      :class="underline ? 'rounded' : ''"
      :style="thumbStyle"
      aria-hidden="true"
    />
    <VBtn
      v-for="(option, index) in options"
      :key="option.value"
      v-bind="option.attrs"
      variant="text"
      size="small"
      role="tab"
      class="app-segmented-tabs__tab position-relative text-body-medium font-weight-medium"
      :class="{ 'app-segmented-tabs__tab--active': option.value === modelValue, 'flex-grow-1': !fit }"
      :aria-selected="option.value === modelValue"
      :tabindex="index === activeIndex ? 0 : -1"
      @click="emit('update:modelValue', option.value)"
      @keydown="onKeydown($event, index)"
    >
      <slot name="tab" :option="option" :active="option.value === modelValue">{{ option.label }}</slot>
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
  /** Extra attributes for this tab's button — ids, aria-controls, data-* (CORE-135: the Historia clínica tabs). */
  attrs?: Record<string, string>;
}

const props = defineProps<{
  modelValue: string;
  options: AppSegmentedTabOption[];
  /** Shrinks to exactly the desktop-sized control (same padding + tab height, not an approximation) — e.g. while the caller's content scrolls, iOS-large-title-style. No-op on desktop, which already renders at that size. */
  compact?: boolean;
  /** Tabs take their label's width instead of equal columns; the bar is only as wide as its tabs. */
  fit?: boolean;
  /** NEO-153: flat row over a hairline with a sliding underline instead of the glass pill — detail views on desktop, where the tabs head a content column. */
  underline?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

defineSlots<{
  /** Custom tab content (status icon, badge); defaults to the label. */
  tab?: (props: { option: AppSegmentedTabOption; active: boolean }) => unknown;
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

/** ←/→ (and Home/End) move the selection and focus, wrapping — a native segmented control's keyboard model. */
function onKeydown(event: KeyboardEvent, index: number): void {
  const last = props.options.length - 1;
  const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  emit("update:modelValue", props.options[next].value);
  void nextTick(() => rootEl.value?.querySelectorAll<HTMLElement>(".app-segmented-tabs__tab")[next]?.focus());
}

/** A fit row that scrolls (a phone, many tabs) keeps the active tab in view; only scrollLeft moves, never the page. */
function revealActive(): void {
  const root = rootEl.value;
  const tab = root?.querySelectorAll<HTMLElement>(".app-segmented-tabs__tab")[activeIndex.value];
  if (!root || !tab || root.scrollWidth <= root.clientWidth) return;
  const left = tab.offsetLeft;
  const right = left + tab.offsetWidth;
  if (left < root.scrollLeft) root.scrollLeft = left;
  else if (right > root.scrollLeft + root.clientWidth) root.scrollLeft = right - root.clientWidth;
}

let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  measure();
  revealActive();
  if (typeof ResizeObserver !== "undefined" && rootEl.value) {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(rootEl.value);
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());
watch(
  () => [props.modelValue, props.options, props.fit, props.compact, props.underline],
  () =>
    void nextTick(() => {
      measure();
      revealActive();
    }),
  { deep: true },
);
</script>

<style scoped>
/* Glass effect: no Vuetify utility for backdrop-filter. CORE-119: the app's
   --glass-* tokens (apps/pwa theme.scss), same material as the bottom nav and
   AuthChrome.vue's pill; the fallbacks are the old local glass. */
/* CORE-135: every switcher wears the calendar's control (Día · Semana · Mes) —
   a quiet grey track, a light glass thumb sliding under the active label. */
.app-segmented-tabs {
  --seg-pad: 2px;
}
.app-segmented-tabs--track {
  padding: var(--seg-pad);
  border-radius: 11px;
  background: rgba(var(--v-theme-on-surface), 0.08);
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
  --seg-pad: 2px;
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
  border-radius: 9px;
  background: rgb(var(--v-theme-surface));
  box-shadow:
    inset 0 1px 0 var(--glass-edge, rgb(255 255 255 / 0.7)),
    0 2px 8px -2px rgb(0 0 0 / 0.22),
    0 0 0 0.5px rgba(var(--v-theme-on-surface), 0.12);
  transition:
    transform 0.5s var(--menu-spring, cubic-bezier(0.34, 1.3, 0.64, 1)),
    width 0.5s var(--menu-spring, cubic-bezier(0.34, 1.3, 0.64, 1));
  will-change: transform;
  pointer-events: none;
}

.app-segmented-tabs__tab {
  z-index: 1;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-transform: none;
  transition: color 0.2s;
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

/* NEO-153 underline: no glass container, a hairline under the row and a 2px
   bar as the thumb. Declared after the pill + fit rules so it wins over both;
   --seg-pad 0 because there is no container padding to inset from. */
.app-segmented-tabs--underline {
  --seg-pad: 0px;
  background: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.app-segmented-tabs--underline.app-segmented-tabs--fit {
  width: 100%;
}
.app-segmented-tabs--underline .app-segmented-tabs__thumb {
  top: auto;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  /* CORE-179: set here, not via bg-primary — Vuetify 4's layered utilities lose
     to the shared thumb's surface background above, which hid the bar. */
  background: rgb(var(--v-theme-primary));
  box-shadow: none;
  transition:
    transform 300ms var(--pwa-ease-spring, cubic-bezier(0.34, 1.2, 0.64, 1)),
    width 300ms var(--pwa-ease-spring, cubic-bezier(0.34, 1.2, 0.64, 1));
}
/* !important: theme.scss makes every labeled VBtn a pill with !important; an
   underline tab is a tab-shaped rectangle that sits on the hairline. */
.app-segmented-tabs--underline .app-segmented-tabs__tab {
  min-height: 44px;
  border-radius: var(--pwa-radius, 8px) var(--pwa-radius, 8px) 0 0 !important;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}
/* CORE-179: the selected label wears the bar's color, so "where am I" reads at a glance. */
.app-segmented-tabs--underline .app-segmented-tabs__tab--active {
  color: rgb(var(--v-theme-primary));
}
.app-segmented-tabs--underline .app-segmented-tabs__tab:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

/* Keyboard focus is drawn inside the tab, never around it: the fit row
   scrolls (overflow-x: auto clips vertically too), so the global 2px-offset
   outline was cut off at the top, and VBtn's own ::after focus border drew a
   second, grey ring on top of it. One ring, inset, plus a light tint. */
.app-segmented-tabs__tab:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
}
.app-segmented-tabs__tab:focus-visible::after {
  opacity: 0;
}
.app-segmented-tabs--underline .app-segmented-tabs__tab:focus-visible {
  background-color: rgba(var(--v-theme-primary), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

@media (prefers-reduced-motion: reduce) {
  .app-segmented-tabs__thumb {
    transition: none;
  }
}

.app-segmented-tabs__tab :deep(.v-btn__content) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  display: block;
}

.app-segmented-tabs__tab--active {
  color: rgb(var(--v-theme-on-surface));
}
/* The track's tabs are the calendar's: rounded like the thumb, never pills (theme.scss pills every labeled VBtn with !important). */
.app-segmented-tabs--track .app-segmented-tabs__tab {
  border-radius: 9px !important;
  font-size: 0.8125rem;
  /* Equal columns already share the row; theme.scss's 16px pill padding
     (!important) would only steal label room ("Sema…" in the calendar). */
  padding-inline: 4px !important;
}
.app-segmented-tabs--track.app-segmented-tabs--fit .app-segmented-tabs__tab {
  padding-inline: 14px !important;
}

.app-segmented-tabs__tab :deep(.v-btn__overlay) {
  display: none;
}

/* CORE-135: the calendar's height on every screen — 32px tabs on a 2px track,
   the size of an iOS segmented control (the phone-only 40px bump is gone). */
.app-segmented-tabs--track .app-segmented-tabs__tab {
  min-height: 32px;
}
</style>
