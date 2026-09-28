<template>
  <div
    class="mobile-nav-panel__scrim"
    :class="{ 'mobile-nav-panel__scrim--visible': expanded }"
    aria-hidden="true"
    @click="setExpanded(false)"
  />

  <!-- One glass box. Collapsed only its bottom row (the pill) shows; "More"
       grows the same box upwards over the module grid, while the row itself
       never moves, so "Close" is exactly where "More" was. -->
  <nav
    v-bind="$attrs"
    class="mobile-nav-panel"
    :class="{ 'mobile-nav-panel--expanded': expanded, 'mobile-nav-panel--dragging': drag !== 0 }"
    :style="drag !== 0 ? { transform: `translateY(${drag}px)` } : undefined"
    :aria-label="ariaLabel"
    @pointerdown="onPointerDown"
    @dragstart.prevent
  >
    <!-- Shadows sit outside the clipped glass, so they are two plain boxes
         that crossfade (pill ⇄ open box) instead of being clipped away. -->
    <div class="mobile-nav-panel__shadow mobile-nav-panel__shadow--pill" aria-hidden="true" />
    <div class="mobile-nav-panel__shadow mobile-nav-panel__shadow--box" aria-hidden="true" />
    <div class="mobile-nav-panel__glass" aria-hidden="true" />

    <div
      v-if="hasOverflow"
      :id="sheetId"
      class="mobile-nav-panel__sheet"
      :inert="expanded ? undefined : true"
    >
      <div class="mobile-nav-panel__handle" aria-hidden="true" />
      <div class="mobile-nav-panel__grid">
        <div v-for="item in overflowItems" :key="item.path" class="mobile-nav-panel__cell">
          <MobileBottomNavItem :to="item.path" :label="item.label" :show-label="showLabels" @click="onItemClick">
            <slot name="icon" :item="item" />
          </MobileBottomNavItem>
        </div>
      </div>
    </div>

    <div class="mobile-nav-panel__items">
      <div v-for="item in primaryItems" :key="item.path" class="mobile-nav-panel__cell">
        <MobileBottomNavItem :to="item.path" :label="item.label" :show-label="showLabels" @click="onItemClick">
          <slot name="icon" :item="item" />
        </MobileBottomNavItem>
      </div>
      <!-- "More" and "Close" are the same button in the same slot: only its
           icon (dots ⇄ X) and label change. -->
      <div v-if="hasOverflow" class="mobile-nav-panel__cell">
        <MobileBottomNavItem
          :label="expanded ? closeLabel : moreLabel"
          :show-label="showLabels"
          :active="!expanded && overflowActive"
          :expanded="expanded"
          :aria-controls="sheetId"
          class="mobile-nav-panel__toggle"
          @click="onToggleClick"
        >
          <span class="mobile-nav-panel__toggle-icon" aria-hidden="true">
            <span class="mobile-nav-panel__dots"><span /><span /><span /></span>
            <svg class="mobile-nav-panel__close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        </MobileBottomNavItem>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from "vue";
import { useRoute } from "vue-router";
import MobileBottomNavItem from "./MobileBottomNavItem.vue";

export interface MobileNavPanelItem {
  path: string;
  label: string;
  name?: string;
}

/**
 * Mobile bottom navigation, NEO-161 "Kropla": one floating liquid-glass box.
 * Collapsed it shows only its bottom row — the first `primaryCount` items plus
 * a "More" toggle — as a pill. "More" grows the same box upwards over the
 * remaining modules; the row never re-flows, so "Close" is exactly where
 * "More" was.
 *
 * All motion is CSS on a class this component toggles: the glass reveals
 * upwards through clip-path, the grid fades in, shadows crossfade. Nothing is
 * measured or laid out from script per frame, so it stays smooth on slow
 * phones. Opens on: "More", or pulling the pill up. Closes on: the same
 * button, a tap on the scrim, a drag down on the open box, Escape, and any
 * navigation. Honors prefers-reduced-motion (state changes, no movement).
 */
// Two roots (scrim + nav): parent class/style (e.g. AppShell's entrance
// animation) belongs on the nav itself.
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

/** How far a drag must travel down before release closes the box. */
const DRAG_CLOSE_THRESHOLD = 64;
/** How far the pill must be pulled up before release opens the box. */
const DRAG_OPEN_THRESHOLD = 32;
/** The pill follows an upward pull at this fraction, capped — a hint, not a real move. */
const DRAG_OPEN_RESISTANCE = 0.35;
const DRAG_OPEN_MAX_LIFT = 16;

const route = useRoute();
const sheetId = `mobile-nav-sheet-${useId()}`;
const expanded = ref(false);
/** Live drag offset (px); 0 = not dragging, the CSS state rules. */
const drag = ref(0);

const hasOverflow = computed(() => props.items.length > props.primaryCount);
const primaryItems = computed(() => props.items.slice(0, props.primaryCount));
const overflowItems = computed(() => props.items.slice(props.primaryCount));

/** "More" reads as the active tab while the rep is inside one of its modules. */
const overflowActive = computed(() =>
  overflowItems.value.some((item) => route.path === item.path || route.path.startsWith(`${item.path}/`)),
);

function setExpanded(next: boolean) {
  expanded.value = next && hasOverflow.value;
  // Clearing the inline offset hands the box back to its CSS transition,
  // which continues from where the finger let go.
  drag.value = 0;
}

function onToggleClick(event: MouseEvent) {
  if (consumeSuppressedClick(event)) return;
  setExpanded(!expanded.value);
}

function onItemClick(event: MouseEvent) {
  // A drag that started on an item must not also navigate.
  consumeSuppressedClick(event);
}

// Any navigation (a grid item, the back arrow, a bar tab) closes the box.
watch(
  () => route.fullPath,
  () => setExpanded(false),
);

// ── Escape ─────────────────────────────────────────────────────────────
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") setExpanded(false);
}
watch(expanded, (isOpen) => {
  if (isOpen) window.addEventListener("keydown", onKeydown);
  else window.removeEventListener("keydown", onKeydown);
});

// ── Drag: pull the pill up to open, drag the open box down to close ────────
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
  if (!expanded.value && !hasOverflow.value) return;
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
    // Open box: follows the finger down 1:1.
    if (!dragging && dragDelta > 8) dragging = true;
    if (dragging) drag.value = Math.max(0, dragDelta);
  } else {
    // Pill: lifts a little under an upward pull, so the gesture visibly "takes".
    if (!dragging && dragDelta < -8) dragging = true;
    if (dragging) drag.value = Math.max(-DRAG_OPEN_MAX_LIFT, Math.min(0, dragDelta * DRAG_OPEN_RESISTANCE));
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
  if (expanded.value) setExpanded(dragDelta <= DRAG_CLOSE_THRESHOLD);
  else setExpanded(dragDelta < -DRAG_OPEN_THRESHOLD);
}

onUnmounted(() => {
  removeDragListeners();
  window.removeEventListener("keydown", onKeydown);
});

defineExpose({ expanded, setExpanded });
</script>

<style scoped>
/* Material + motion tokens. The app (apps/pwa theme.scss) sets them per
   theme; these fallbacks keep the component usable on its own. */
.mobile-nav-panel,
.mobile-nav-panel__scrim {
  --_float: var(--mobile-bottom-nav-float, 10px);
  --_height: var(--mobile-bottom-nav-height, 64px);
  --_radius-open: 28px;
  --_glass: var(--glass-surface, rgb(255 255 255 / 0.74));
  --_glass-solid: var(--glass-solid, #fff);
  --_glass-blur: var(--glass-blur, blur(18px) saturate(170%));
  --_glass-edge: var(--glass-edge, rgb(255 255 255 / 0.7));
  --_glass-shadow: var(--glass-shadow, 0 12px 32px -10px rgb(0 0 0 / 0.28));
  --_dur-in: var(--menu-dur-in, 420ms);
  --_dur-out: var(--menu-dur-out, 180ms);
  --_spring: var(--menu-spring, cubic-bezier(0.34, 1.3, 0.64, 1));
  --_ease-out: var(--menu-ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

/* The box: floats --_float above the bottom edge (and the home indicator),
   a phone-sized cluster in the middle on tablets. Its height is the grid +
   the row; only the row is visible (and tappable) while collapsed. */
.mobile-nav-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--_float) + env(safe-area-inset-bottom));
  z-index: 9998;
  width: calc(100% - 2 * var(--_float));
  max-width: 480px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  /* The collapsed grid area must not swallow taps meant for the page. */
  pointer-events: none;
  transition: transform var(--_dur-out) var(--_ease-out);
  /* Vertical drags are ours (pull up to open, drag down to close) — the box
     never scrolls, so the browser must not claim them as a pan. */
  touch-action: none;
}

.mobile-nav-panel--dragging {
  transition: none;
}

/* The glass: one surface behind the grid and the row. Collapsed it is
   clipped to the pill at the bottom; open it reveals upwards to the whole
   box. clip-path + opacity only — no height, no layout per frame. */
.mobile-nav-panel__glass {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--_glass);
  -webkit-backdrop-filter: var(--_glass-blur);
  backdrop-filter: var(--_glass-blur);
  box-shadow: inset 0 1px 0 var(--_glass-edge);
  border-radius: var(--_radius-open);
  clip-path: inset(calc(100% - var(--_height)) 0 0 0 round calc(var(--_height) / 2));
  transition: clip-path var(--_dur-out) var(--_ease-out);
}

/* Open, the glass gets denser: the module labels sit on top of the page's
   own text, which must not read through them. */
.mobile-nav-panel--expanded .mobile-nav-panel__glass {
  clip-path: inset(0 0 0 0 round var(--_radius-open));
  background: color-mix(in srgb, var(--_glass-solid) 94%, transparent);
  transition:
    clip-path var(--_dur-in) var(--_spring),
    background-color 200ms linear;
}

.mobile-nav-panel__shadow {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -2;
  box-shadow: var(--_glass-shadow);
  transition: opacity var(--_dur-out) linear;
}

.mobile-nav-panel__shadow--pill {
  height: var(--_height);
  border-radius: calc(var(--_height) / 2);
}

.mobile-nav-panel__shadow--box {
  top: 0;
  border-radius: var(--_radius-open);
  opacity: 0;
}

.mobile-nav-panel--expanded .mobile-nav-panel__shadow--pill {
  opacity: 0;
}

.mobile-nav-panel--expanded .mobile-nav-panel__shadow--box {
  opacity: 1;
  transition-duration: 240ms;
}

/* The row: always the bottom of the box, never moves. */
.mobile-nav-panel__items {
  flex: none;
  height: var(--_height);
  padding-inline: 6px;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  min-width: 0;
  pointer-events: auto;
}

.mobile-nav-panel__cell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}

.mobile-nav-panel__cell :deep(.mobile-bottom-nav-item) {
  flex: 1 1 auto;
  max-width: none;
  min-width: 0;
}

/* The grid above the row, inside the same box. Collapsed it is hidden and
   out of the tab order (inert); open it settles in a beat after the glass. */
.mobile-nav-panel__sheet {
  padding: 6px 8px 0;
  opacity: 0;
  transform: translateY(10px);
  visibility: hidden;
  transition:
    opacity 100ms linear,
    transform 100ms linear,
    visibility 0s linear var(--_dur-out);
}

.mobile-nav-panel--expanded .mobile-nav-panel__sheet {
  opacity: 1;
  transform: none;
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 200ms linear 90ms,
    transform 280ms var(--_ease-out) 90ms,
    visibility 0s;
}

.mobile-nav-panel__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--mobile-bottom-nav-item-color, #666) 16%, transparent);
}

.mobile-nav-panel__grid .mobile-nav-panel__cell {
  min-height: 68px;
}

.mobile-nav-panel__grid .mobile-nav-panel__cell :deep(.mobile-bottom-nav-item) {
  border-radius: 16px;
}

.mobile-nav-panel__grid .mobile-nav-panel__cell :deep(.mobile-bottom-nav-item__label) {
  text-align: center;
  line-height: 1.2;
}

/* Visible affordance for the drag-down gesture. */
.mobile-nav-panel__handle {
  width: 36px;
  height: 4px;
  margin: 2px auto 6px;
  border-radius: 2px;
  background: var(--mobile-bottom-nav-item-color, #666);
  opacity: 0.35;
}

/* "More" dots ⇄ Close X, in place. */
.mobile-nav-panel__toggle-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
}

.mobile-nav-panel__dots,
.mobile-nav-panel__close {
  grid-area: 1 / 1;
  transition:
    opacity var(--_dur-out) linear,
    transform var(--_dur-out) var(--_ease-out);
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

.mobile-nav-panel__close {
  width: 20px;
  height: 20px;
  opacity: 0;
  transform: rotate(-90deg) scale(0.5);
}

.mobile-nav-panel--expanded .mobile-nav-panel__toggle {
  color: var(--mobile-bottom-nav-item-active-color, #1976d2);
}

.mobile-nav-panel--expanded .mobile-nav-panel__dots {
  opacity: 0;
  transform: rotate(90deg) scale(0.5);
}

.mobile-nav-panel--expanded .mobile-nav-panel__close {
  opacity: 1;
  transform: none;
}

/* A plain dim, no blur: cheap to fade on any phone. */
.mobile-nav-panel__scrim {
  position: fixed;
  inset: 0;
  z-index: 9997;
  background: var(--mobile-nav-scrim, rgb(0 0 0 / 0.28));
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--_dur-out) linear;
}

.mobile-nav-panel__scrim--visible {
  opacity: 1;
  pointer-events: auto;
  transition-duration: 240ms;
}

/* No glass where the browser can't blur, or the user asked for less
   transparency: the same shape in a solid surface. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .mobile-nav-panel__glass {
    background: var(--_glass-solid);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .mobile-nav-panel__glass {
    background: var(--_glass-solid);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-nav-panel__sheet,
  .mobile-nav-panel--expanded .mobile-nav-panel__sheet {
    transform: none;
  }

  .mobile-nav-panel,
  .mobile-nav-panel__glass,
  .mobile-nav-panel--expanded .mobile-nav-panel__glass,
  .mobile-nav-panel__shadow,
  .mobile-nav-panel__sheet,
  .mobile-nav-panel--expanded .mobile-nav-panel__sheet,
  .mobile-nav-panel__dots,
  .mobile-nav-panel__close,
  .mobile-nav-panel__scrim {
    transition-duration: 0s;
    transition-delay: 0s;
  }
}
</style>
