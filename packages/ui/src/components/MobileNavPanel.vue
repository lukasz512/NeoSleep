<template>
  <Transition name="mobile-nav-panel-scrim">
    <div v-if="expanded" class="mobile-nav-panel__scrim" aria-hidden="true" @click="setExpanded(false)" />
  </Transition>

  <nav
    ref="panelEl"
    v-bind="$attrs"
    class="mobile-nav-panel"
    :class="{ 'mobile-nav-panel--expanded': expanded, 'mobile-nav-panel--dragging': dragOffset !== 0 }"
    :style="dragOffset !== 0 ? { transform: `translateY(${dragOffset}px)` } : undefined"
    :aria-label="ariaLabel"
    @pointerdown="onPointerDown"
    @dragstart.prevent
  >
    <div v-if="expanded" class="mobile-nav-panel__handle" aria-hidden="true" />
    <div class="mobile-nav-panel__items">
      <div
        v-for="(item, index) in items"
        :key="item.path"
        :ref="(el) => setCellEl(item.path, el)"
        class="mobile-nav-panel__cell"
        :class="{ 'mobile-nav-panel__cell--overflow': index >= primaryCount }"
      >
        <MobileBottomNavItem :to="item.path" :label="item.label" :show-label="showLabels" @click="onItemClick">
          <slot name="icon" :item="item" />
        </MobileBottomNavItem>
      </div>
      <div v-if="hasOverflow" :ref="(el) => setCellEl(TOGGLE_KEY, el)" class="mobile-nav-panel__cell">
        <MobileBottomNavItem
          :label="expanded ? closeLabel : moreLabel"
          :show-label="showLabels"
          :active="!expanded && overflowActive"
          :expanded="expanded"
          class="mobile-nav-panel__toggle"
          @click="onToggleClick"
        >
          <span class="mobile-nav-panel__toggle-icon" aria-hidden="true">
            <span class="mobile-nav-panel__dots"><span /><span /><span /></span>
            <svg class="mobile-nav-panel__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </MobileBottomNavItem>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue";
import { useRoute } from "vue-router";
import MobileBottomNavItem from "./MobileBottomNavItem.vue";

export interface MobileNavPanelItem {
  path: string;
  label: string;
  name?: string;
}

/**
 * Mobile bottom navigation that expands in place into a grid of every
 * module (NEO-55). Collapsed it is the familiar bottom bar: the first
 * `primaryCount` items plus a "More" toggle. Expanded, the *same* cells
 * re-flow into a 4-column grid, so each item visibly travels from its bar
 * slot to its grid slot (FLIP, via the Web Animations API), the overflow
 * items fade in behind them, and "More" — which lands in the grid's last
 * cell, next to where it was — turns into a close chevron.
 *
 * Opens on: "More", or pulling the bar up. Closes on: the chevron, a tap on
 * the scrim, a drag down, Escape, and any navigation. Honors
 * prefers-reduced-motion (state changes, no movement).
 */
// Two roots (scrim + panel): parent class/style (e.g. AppShell's entrance
// animation) belongs on the panel itself, which stays position: fixed — a
// transformed wrapper would re-anchor it.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    items: MobileNavPanelItem[];
    primaryCount?: number;
    showLabels?: boolean;
    ariaLabel?: string;
    moreLabel?: string;
    closeLabel?: string;
  }>(),
  { primaryCount: 4, showLabels: false, ariaLabel: "Navigation", moreLabel: "More", closeLabel: "Close" },
);

const TOGGLE_KEY = "__toggle__";
const DURATION = 360;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";
/** How far a drag must travel down before release closes the panel. */
const DRAG_CLOSE_THRESHOLD = 72;
/** How far the collapsed bar must be pulled up before release opens it. */
const DRAG_OPEN_THRESHOLD = 32;
/** The collapsed bar follows an upward pull at this fraction, capped — a hint, not a real move. */
const DRAG_OPEN_RESISTANCE = 0.35;
const DRAG_OPEN_MAX_LIFT = 20;

const route = useRoute();
const panelEl = ref<HTMLElement | null>(null);
const expanded = ref(false);
const dragOffset = ref(0);
const cellEls = new Map<string, HTMLElement>();

const hasOverflow = computed(() => props.items.length > props.primaryCount);

/** "More" reads as the active tab while the rep is inside one of its modules. */
const overflowActive = computed(() =>
  props.items
    .slice(props.primaryCount)
    .some((item) => route.path === item.path || route.path.startsWith(`${item.path}/`)),
);

function setCellEl(key: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) cellEls.set(key, el);
  else cellEls.delete(key);
}

function isRendered(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let transitioning = false;

async function setExpanded(next: boolean) {
  if (next === expanded.value || transitioning) return;
  const panel = panelEl.value;
  if (!panel || prefersReducedMotion() || typeof panel.animate !== "function") {
    expanded.value = next;
    dragOffset.value = 0;
    return;
  }
  transitioning = true;
  try {
    // Collapsing: the overflow items have no slot in the bar, so they fade
    // out first instead of vanishing when the layout snaps back.
    if (!next) {
      const leaving = [...cellEls.entries()]
        .filter(([key, el]) => key !== TOGGLE_KEY && el.classList.contains("mobile-nav-panel__cell--overflow"))
        .map(([, el]) =>
          el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(8px)" }], {
            duration: 120,
            easing: "ease-in",
            fill: "forwards",
          }),
        );
      // benign: a cancelled animation rejects `finished` — it is still finished for our purposes.
      await Promise.all(leaving.map((a) => a.finished.catch(() => undefined)));
      leaving.forEach((a) => a.cancel());
    }

    // FLIP — First: where everything is now (a drag offset included, so a
    // drag-to-close continues from where the finger let go).
    const first = new Map<string, DOMRect>();
    cellEls.forEach((el, key) => {
      if (isRendered(el)) first.set(key, el.getBoundingClientRect());
    });
    const panelFirst = panel.getBoundingClientRect();

    // Last: switch layout.
    expanded.value = next;
    dragOffset.value = 0;
    await nextTick();
    const panelLast = panel.getBoundingClientRect();

    // Invert + Play. The panel is pinned to the bottom, so animating its
    // height grows/shrinks it upward — the bar "rises" into the sheet.
    panel.animate(
      [
        { height: `${panelFirst.height}px`, transform: `translateY(${panelFirst.bottom - panelLast.bottom}px)` },
        { height: `${panelLast.height}px`, transform: "none" },
      ],
      { duration: DURATION, easing: EASING },
    );

    let appearIndex = 0;
    cellEls.forEach((el, key) => {
      if (!isRendered(el)) return;
      const last = el.getBoundingClientRect();
      const from = first.get(key);
      if (from) {
        el.animate(
          [{ transform: `translate(${from.left - last.left}px, ${from.top - last.top}px)` }, { transform: "none" }],
          { duration: DURATION, easing: EASING },
        );
      } else {
        el.animate(
          [
            { opacity: 0, transform: "translateY(12px) scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 260, delay: 120 + appearIndex++ * 40, easing: EASING, fill: "backwards" },
        );
      }
    });
  } finally {
    transitioning = false;
  }
}

function onToggleClick(event: MouseEvent) {
  if (consumeSuppressedClick(event)) return;
  void setExpanded(!expanded.value);
}

function onItemClick(event: MouseEvent) {
  // A drag that started on an item must not also navigate.
  consumeSuppressedClick(event);
}

// Any navigation (a grid item, the back arrow, a bar tab) collapses the panel.
watch(
  () => route.fullPath,
  () => void setExpanded(false),
);

// ── Escape ─────────────────────────────────────────────────────────────
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") void setExpanded(false);
}
watch(expanded, (isOpen) => {
  if (isOpen) window.addEventListener("keydown", onKeydown);
  else window.removeEventListener("keydown", onKeydown);
});

// ── Drag: pull the bar up to open, drag the grid down to close ────────────
let dragStartY = 0;
let dragging = false;
/** Raw finger travel (px, negative = up), independent of the resisted visual offset. */
let dragDelta = 0;
let suppressNextClick = false;

function consumeSuppressedClick(event: MouseEvent): boolean {
  if (!suppressNextClick) return false;
  suppressNextClick = false;
  event.preventDefault();
  return true;
}

function onPointerDown(event: PointerEvent) {
  if (transitioning || (!expanded.value && !hasOverflow.value)) return;
  dragStartY = event.clientY;
  dragging = false;
  dragDelta = 0;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(event: PointerEvent) {
  dragDelta = event.clientY - dragStartY;
  if (expanded.value) {
    // Grid: follows the finger down 1:1.
    if (!dragging && dragDelta > 8) dragging = true;
    if (dragging) dragOffset.value = Math.max(0, dragDelta);
  } else {
    // Bar: lifts a little under an upward pull, so the gesture visibly "takes".
    if (!dragging && dragDelta < -8) dragging = true;
    if (dragging) dragOffset.value = Math.max(-DRAG_OPEN_MAX_LIFT, Math.min(0, dragDelta * DRAG_OPEN_RESISTANCE));
  }
}

function removeDragListeners() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
}

function onPointerUp() {
  removeDragListeners();
  if (!dragging) return;
  dragging = false;
  suppressNextClick = true;
  // The click (if any) fires right after pointerup; drop the guard after it.
  window.setTimeout(() => (suppressNextClick = false), 0);
  // Both continue from where the finger let go: setExpanded measures the
  // FLIP "first" positions with the drag offset still applied.
  if (expanded.value && dragDelta > DRAG_CLOSE_THRESHOLD) {
    void setExpanded(false);
  } else if (!expanded.value && dragDelta < -DRAG_OPEN_THRESHOLD) {
    void setExpanded(true);
  } else {
    const panel = panelEl.value;
    const from = dragOffset.value;
    dragOffset.value = 0;
    panel?.animate?.([{ transform: `translateY(${from}px)` }, { transform: "none" }], {
      duration: 200,
      easing: EASING,
    });
  }
}

onUnmounted(() => {
  removeDragListeners();
  window.removeEventListener("keydown", onKeydown);
});

defineExpose({ expanded, setExpanded });
</script>

<style scoped>
/* Collapsed: identical to MobileBottomNavBar (same tokens, same metrics). */
.mobile-nav-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  height: calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom));
  /* Same side edge as the page content above it (NEO-61). */
  padding-inline: var(--page-gutter, 20px);
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--mobile-bottom-nav-bg, #fff);
  border-top: 1px solid var(--mobile-bottom-nav-border, rgba(0, 0, 0, 0.12));
  border-top-left-radius: var(--mobile-bottom-nav-radius, 0);
  border-top-right-radius: var(--mobile-bottom-nav-radius, 0);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  /* Vertical drags are ours (pull up to open, drag down to close) — the bar
     never scrolls, so the browser must not claim them as a pan. Taps are
     unaffected. */
  touch-action: none;
}

.mobile-nav-panel__items {
  flex: 1 1 auto;
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: var(--space-2, 8px);
  /* Tablet width (NEO-61): the items — and the expanded module grid — stay a
     phone-sized cluster in the middle instead of spreading across the whole
     bar. 5 cells × 89px + 4 gaps. */
  width: 100%;
  max-width: 480px;
  margin-inline: auto;
}

.mobile-nav-panel__cell {
  flex: 0 1 89px;
  min-width: 55px;
  display: flex;
}

.mobile-nav-panel__cell :deep(.mobile-bottom-nav-item) {
  flex: 1 1 auto;
  max-width: none;
  min-width: 0;
}

.mobile-nav-panel__cell--overflow {
  display: none;
}

/* Expanded: the same cells as a 4-column grid, the panel sized by content. */
.mobile-nav-panel--expanded {
  height: auto;
  padding-top: var(--space-2, 8px);
  padding-bottom: calc(var(--space-4, 16px) + env(safe-area-inset-bottom));
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.16);
}

.mobile-nav-panel--expanded .mobile-nav-panel__items {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2, 8px);
}

.mobile-nav-panel--expanded .mobile-nav-panel__cell,
.mobile-nav-panel--expanded .mobile-nav-panel__cell--overflow {
  display: flex;
  min-height: 72px;
}

.mobile-nav-panel--expanded .mobile-nav-panel__cell :deep(.mobile-bottom-nav-item__label) {
  text-align: center;
  line-height: 1.2;
}

.mobile-nav-panel--dragging {
  transition: none;
}

/* Visible affordance for the drag-down gesture. */
.mobile-nav-panel__handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 8px;
  border-radius: 2px;
  background: currentColor;
  color: var(--mobile-bottom-nav-item-color, #666);
  opacity: 0.35;
  flex: none;
}

/* "More" dots ⇄ close chevron, crossfading in place. */
.mobile-nav-panel__toggle-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
}

.mobile-nav-panel__dots,
.mobile-nav-panel__chevron {
  grid-area: 1 / 1;
  transition:
    opacity 200ms ease,
    transform 360ms cubic-bezier(0.2, 0, 0, 1);
}

.mobile-nav-panel__dots {
  display: flex;
  align-items: center;
  gap: 3px;

  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }
}

.mobile-nav-panel__chevron {
  width: 22px;
  height: 22px;
  opacity: 0;
  transform: rotate(-180deg);
}

.mobile-nav-panel--expanded .mobile-nav-panel__dots {
  opacity: 0;
  transform: rotate(90deg) scale(0.6);
}

.mobile-nav-panel--expanded .mobile-nav-panel__chevron {
  opacity: 1;
  transform: none;
}

.mobile-nav-panel__scrim {
  position: fixed;
  inset: 0;
  z-index: 9997;
  background: rgba(0, 0, 0, 0.32);
}

.mobile-nav-panel-scrim-enter-active,
.mobile-nav-panel-scrim-leave-active {
  transition: opacity 280ms ease;
}

.mobile-nav-panel-scrim-enter-from,
.mobile-nav-panel-scrim-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .mobile-nav-panel__dots,
  .mobile-nav-panel__chevron,
  .mobile-nav-panel-scrim-enter-active,
  .mobile-nav-panel-scrim-leave-active {
    transition: none;
  }
}
</style>
