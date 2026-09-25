<template>
  <div class="app-chip-tabs" :class="{ 'app-chip-tabs--fade-start': fadeStart, 'app-chip-tabs--fade-end': fadeEnd }">
    <div ref="rowEl" class="app-chip-tabs__row" role="tablist" @scroll.passive="updateFades">
      <button
        v-for="(option, i) in options"
        :key="option.value"
        type="button"
        role="tab"
        class="app-chip-tabs__chip"
        :class="{ 'app-chip-tabs__chip--active': option.value === modelValue }"
        :aria-selected="option.value === modelValue"
        :tabindex="option.value === modelValue ? 0 : -1"
        @click="$emit('update:modelValue', option.value)"
        @keydown="onKeydown($event, i)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AppSegmentedTabOption } from "./AppSegmentedTabs.vue";

/**
 * Phone tab switcher (NEO-61, pattern A "scrolling chips" — Apple Health /
 * Epic Haiku / Veeva CRM mobile): one chip per section at its label's own
 * width, in a row that scrolls sideways instead of squeezing 6–7 sections into
 * equal slots and ellipsizing them ("D… N… S…"). The row bleeds to the screen
 * edges (--page-gutter) so chips scroll under the edge rather than being cut
 * at the gutter; a fade on either side shows there is more to scroll to, and
 * the active chip is scrolled into view whenever it changes.
 *
 * Same option shape as AppSegmentedTabs, so a caller can swap between the two
 * by breakpoint (see apps/pwa DetailViewTabs.vue).
 */
const props = defineProps<{
  modelValue: string;
  options: AppSegmentedTabOption[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const rowEl = ref<HTMLElement | null>(null);
const fadeStart = ref(false);
const fadeEnd = ref(false);

function updateFades(): void {
  const row = rowEl.value;
  if (!row) return;
  fadeStart.value = row.scrollLeft > 1;
  fadeEnd.value = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
}

function activeChip(): HTMLElement | undefined {
  const i = props.options.findIndex((o) => o.value === props.modelValue);
  return rowEl.value?.querySelectorAll<HTMLElement>(".app-chip-tabs__chip")[i];
}

/** Scroll only the row (never the page) so the active chip is fully visible. */
function revealActive(smooth: boolean): void {
  const row = rowEl.value;
  const chip = activeChip();
  if (!row || !chip) return;
  const pad = parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 0;
  const left = chip.offsetLeft - pad;
  const right = chip.offsetLeft + chip.offsetWidth + pad - row.clientWidth;
  const target = row.scrollLeft > left ? left : row.scrollLeft < right ? right : row.scrollLeft;
  if (target === row.scrollLeft) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  row.scrollTo({ left: target, behavior: smooth && !reduce ? "smooth" : "auto" });
}

/** WAI-ARIA tabs keyboard model: arrows / Home / End move and select. */
function onKeydown(event: KeyboardEvent, index: number): void {
  const last = props.options.length - 1;
  const next =
    event.key === "ArrowRight" ? Math.min(index + 1, last)
    : event.key === "ArrowLeft" ? Math.max(index - 1, 0)
    : event.key === "Home" ? 0
    : event.key === "End" ? last
    : -1;
  if (next < 0 || next === index) return;
  event.preventDefault();
  emit("update:modelValue", props.options[next].value);
  void nextTick(() => activeChip()?.focus());
}

let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  revealActive(false);
  updateFades();
  if (typeof ResizeObserver !== "undefined" && rowEl.value) {
    resizeObserver = new ResizeObserver(updateFades);
    resizeObserver.observe(rowEl.value);
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());
watch(
  () => props.modelValue,
  () => void nextTick(() => revealActive(true)),
);
</script>

<style scoped>
/* Bleeds out of the page gutter to the screen edges; the gutter comes back as
   inner padding, so the first chip still starts on the content edge. */
.app-chip-tabs {
  --chip-fade: 24px;
  margin-inline: calc(-1 * var(--page-gutter, 20px));
  /* The row's content (every chip side by side) must never become this
     element's intrinsic width — otherwise any flex/grid ancestor sizes to it
     and the whole page grows sideways instead of the row scrolling. */
  contain: inline-size;
  min-width: 0;
}

.app-chip-tabs__row {
  display: flex;
  gap: var(--space-2, 8px);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  padding-inline: var(--page-gutter, 20px);
  /* Room for the active chip's shadow, which overflow would otherwise clip. */
  padding-block: var(--space-1, 4px);
  scroll-padding-inline: var(--page-gutter, 20px);
}
.app-chip-tabs__row::-webkit-scrollbar {
  display: none;
}

/* Edge fades only on a side that actually has more chips behind it. */
.app-chip-tabs--fade-end .app-chip-tabs__row {
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - var(--chip-fade)), transparent);
  mask-image: linear-gradient(90deg, #000 calc(100% - var(--chip-fade)), transparent);
}
.app-chip-tabs--fade-start .app-chip-tabs__row {
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 var(--chip-fade));
  mask-image: linear-gradient(90deg, transparent, #000 var(--chip-fade));
}
.app-chip-tabs--fade-start.app-chip-tabs--fade-end .app-chip-tabs__row {
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 var(--chip-fade), #000 calc(100% - var(--chip-fade)), transparent);
  mask-image: linear-gradient(90deg, transparent, #000 var(--chip-fade), #000 calc(100% - var(--chip-fade)), transparent);
}

/* 40px tall — the same height the phone segmented bar used, per earlier
   feedback that 44px read as too tall for this control. */
.app-chip-tabs__chip {
  flex: 0 0 auto;
  min-height: 40px;
  padding-inline: var(--space-4, 16px);
  border-radius: 999px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    color 200ms ease;
}

.app-chip-tabs__chip:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.app-chip-tabs__chip:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.app-chip-tabs__chip--active,
.app-chip-tabs__chip--active:hover {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  box-shadow: 0 2px 8px rgba(var(--v-theme-primary), 0.3);
}
</style>
