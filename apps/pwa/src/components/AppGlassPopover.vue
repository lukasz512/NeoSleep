<template>
  <!-- NEO-122 / NEO-154: an app bar button turns into a glass card (the
       account menu; the notification bell since CORE-4). The button itself
       comes from the #trigger slot (so the caller keeps its styles);
       data-motion="trigger-avatar" inside it is where the card lands. -->
  <span
    ref="triggerWrap"
    class="glass-popover__trigger"
    :class="{ 'glass-popover__trigger--hidden': triggerHidden, 'glass-popover__trigger--pressed': pressed }"
    @click="toggle"
    @pointerdown="onTriggerPress"
  >
    <slot name="trigger" :open="open" />
  </span>

  <Teleport to="body">
    <!-- NEO-161 "Kropla": the same glass card on desktop and phone, springing
         out of the button's anchor (avatar, bell). The motion is CSS on
         --open (transform + opacity), the same material and spring as the
         phone's bottom menu. -->
    <div
      v-if="rendered"
      class="glass-popover"
      :class="{
        'glass-popover--phone': mobile,
        'glass-popover--open': shown,
        'glass-popover--dragging': dragging,
        'glass-popover--from-press': fromPress,
      }"
    >
      <div ref="dim" class="glass-popover__dim" :data-testid="`${testId}-dim`" @click="close" />
      <div
        ref="panel"
        class="glass-popover__card"
        role="dialog"
        :aria-label="label"
        tabindex="-1"
        :data-testid="testId"
        :class="{ 'glass-popover__card--swipe': swipeable && swipeFrom === 'card', 'glass-popover__card--swipe-handle': swipeable && swipeFrom === 'handle' }"
        :style="{ '--glass-popover-width': `${width}px` }"
        @pointerdown="onCardPointerDown"
        @click.capture="onCardClickCapture"
      >
        <slot />
        <!-- Phone: same grabber as the bottom nav's module capsule, so the
             card reads as something that can be swiped away (upwards). -->
        <div v-if="mobile" class="glass-popover__handle" aria-hidden="true" data-motion="row" data-glass-swipe :data-testid="`${testId}-handle`" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { CLOSE_DURATION, MENU_AVATAR_SIZE, motionAllowed, placeCard } from "../composables/useGlassPopoverMotion";

const props = withDefaults(
  defineProps<{
    /** Phone: the card spans the screen width (same motion as desktop). */
    mobile: boolean;
    /** Accessible name of the dialog. */
    label: string;
    /** data-testid of the card; the dim and handle get `-dim` / `-handle`. */
    testId?: string;
    /** Desktop card width in px. */
    width?: number;
    /** Size of the anchor in the card's header (`data-motion="avatar"`). */
    anchorSize?: number;
    /**
     * Phone, where a swipe up may start: anywhere on the card (it never
     * scrolls), or only on `[data-glass-swipe]` parts (header, handle) so a
     * long list inside the card keeps its own scrolling (CORE-4).
     */
    swipeFrom?: "card" | "handle";
  }>(),
  { testId: "glass-popover", width: 340, anchorSize: MENU_AVATAR_SIZE, swipeFrom: "card" },
);

const open = defineModel<boolean>("open", { default: false });

const triggerWrap = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const dim = ref<HTMLElement | null>(null);
/** The overlay is in the DOM (open, or still animating closed). */
const rendered = ref(false);
/** The open state the CSS transitions to (a frame after `rendered`). */
const shown = ref(false);
/** The button is hidden while the menu stands in its place. */
const triggerHidden = ref(false);
/** Phone: the app bar avatar is swollen under the finger (CSS does the swell). */
const pressed = ref(false);
/** Phone: this open started from a press, so the drop starts from the swollen size. */
const fromPress = ref(false);
/** Phone: the card fits without scrolling, so a vertical swipe can move it. */
const swipeable = ref(false);
/** The finger is moving the card right now (no transition while it does). */
const dragging = ref(false);
/** Bumped on every open/close so a superseded one doesn't finish the wrong one. */
let run = 0;

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function triggerButton(): HTMLElement | null {
  return triggerWrap.value?.querySelector<HTMLElement>("button, [role='button']") ?? null;
}

// ── Phone: the avatar swells under the finger, like a drop about to fall ──
function onTriggerPress(e: PointerEvent) {
  if (!props.mobile || open.value || e.button !== 0) return;
  pressed.value = true;
  const done = () => {
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
    // a tap opens the menu (click comes right after pointerup); anything else lets go
    setTimeout(() => {
      if (!open.value) pressed.value = false;
    }, 0);
  };
  window.addEventListener("pointerup", done);
  window.addEventListener("pointercancel", done);
}

// ── Phone: swipe the card up to close it ─────────────────────────────────
/** Past this many px upwards (or a quick flick) the card closes on release. */
const SWIPE_CLOSE_DISTANCE = 64;
const SWIPE_CLOSE_VELOCITY = 0.5; // px per ms
/** A move shorter than this is still a tap. */
const SWIPE_SLOP = 6;
let swipe: { id: number; y0: number; x0: number; t0: number; dy: number; active: boolean } | null = null;
/** Set after a real drag so the click that follows pointerup doesn't hit a button. */
let swallowClick = false;

function setDrag(dy: number) {
  const card = panel.value;
  if (!card || !dim.value) return;
  // up follows the finger, down only gives a little (rubber band)
  const y = dy < 0 ? dy : dy / 4;
  card.style.transform = y ? `translateY(${y}px)` : "";
  const h = card.offsetHeight || 1;
  dim.value.style.opacity = dy < 0 ? String(Math.max(0, 1 + dy / h)) : "";
}

function onCardPointerDown(e: PointerEvent) {
  if (!props.mobile || !swipeable.value || !open.value || e.button !== 0) return;
  if (props.swipeFrom === "handle" && !(e.target instanceof Element && e.target.closest(`[data-glass-swipe], .${SCROLL_FITS}`))) return;
  swipe = { id: e.pointerId, y0: e.clientY, x0: e.clientX, t0: e.timeStamp, dy: 0, active: false };
  window.addEventListener("pointermove", onSwipeMove);
  window.addEventListener("pointerup", onSwipeEnd);
  window.addEventListener("pointercancel", onSwipeEnd);
}

function onSwipeMove(e: PointerEvent) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dy = e.clientY - swipe.y0;
  if (!swipe.active) {
    if (Math.abs(dy) < SWIPE_SLOP || Math.abs(dy) < Math.abs(e.clientX - swipe.x0)) return;
    swipe.active = true;
    dragging.value = true;
  }
  swipe.dy = dy;
  setDrag(dy);
}

function endSwipeListeners() {
  window.removeEventListener("pointermove", onSwipeMove);
  window.removeEventListener("pointerup", onSwipeEnd);
  window.removeEventListener("pointercancel", onSwipeEnd);
}

function onSwipeEnd(e: PointerEvent) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const { active, dy, t0 } = swipe;
  swipe = null;
  endSwipeListeners();
  if (!active) return;
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 0);
  dragging.value = false;
  const velocity = -dy / Math.max(1, e.timeStamp - t0);
  if (dy < 0 && (-dy > SWIPE_CLOSE_DISTANCE || velocity > SWIPE_CLOSE_VELOCITY)) {
    close(); // the CSS close transition continues from where the card was let go
    return;
  }
  // not far enough: spring back (the CSS transition on the card carries it)
  setDrag(0);
}

function onCardClickCapture(e: MouseEvent) {
  if (!swallowClick) return;
  e.stopPropagation();
  e.preventDefault();
}

// ── Phone, swipeFrom "handle": a list that fits takes the swipe too ─────────
// While the [data-glass-scroll] list has nothing to scroll, the whole card
// can be pulled up like the account card (Łukasz, 2026-10-04); once it
// overflows, only the header and handle can, so the list keeps scrolling.
// The class switches touch-action, which the browser reads at touchstart.
const SCROLL_FITS = "glass-popover__scroll--fits";
let fitResize: ResizeObserver | null = null;
let fitMutations: MutationObserver | null = null;

function stopScrollFit() {
  fitResize?.disconnect();
  fitMutations?.disconnect();
  fitResize = null;
  fitMutations = null;
}

function watchScrollFit(card: HTMLElement) {
  stopScrollFit();
  const list = card.querySelector<HTMLElement>("[data-glass-scroll]");
  if (!list || !props.mobile || props.swipeFrom !== "handle") return;
  const update = () => list.classList.toggle(SCROLL_FITS, list.scrollHeight <= list.clientHeight + 1);
  const observeAll = () => {
    if (!fitResize) return;
    fitResize.disconnect();
    fitResize.observe(list);
    for (const child of Array.from(list.children)) fitResize.observe(child);
  };
  if (typeof ResizeObserver !== "undefined") fitResize = new ResizeObserver(update);
  if (typeof MutationObserver !== "undefined") {
    // rows arrive after the card opens (the list loads then), so re-check on every change
    fitMutations = new MutationObserver(() => {
      observeAll();
      update();
    });
    fitMutations.observe(list, { childList: true, subtree: true });
  }
  observeAll();
  update();
}

function resetDrag() {
  swipe = null;
  dragging.value = false;
  endSwipeListeners();
  if (panel.value) panel.value.style.transform = "";
  if (dim.value) dim.value.style.opacity = "";
}

/** Resolves on the next painted frame, so the closed state is drawn before --open. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function show() {
  const id = ++run;
  fromPress.value = pressed.value;
  rendered.value = true;
  await nextTick();
  if (id !== run) return;
  const card = panel.value;
  const triggerAvatar = triggerWrap.value?.querySelector('[data-motion="trigger-avatar"]');
  if (card && triggerAvatar) {
    // measured once, while the button is still there, so the card lands on its avatar
    placeCard({ triggerAvatar, card, phone: props.mobile, anchorSize: props.anchorSize });
    card.querySelectorAll<HTMLElement>('[data-motion="row"]').forEach((row, i) => row.style.setProperty("--glass-popover-i", String(i)));
    swipeable.value = props.mobile && (props.swipeFrom === "handle" || card.scrollHeight <= card.clientHeight);
    watchScrollFit(card);
  }
  // the menu's avatar takes over at once, so the pressed bar avatar can't peek out behind it
  triggerHidden.value = true;
  pressed.value = false;
  if (motionAllowed()) await nextFrame();
  if (id !== run) return;
  shown.value = true;
  panel.value?.focus({ preventScroll: true });
}

async function hide() {
  const id = ++run;
  if (!rendered.value) return;
  shown.value = false;
  stopScrollFit();
  // Dropping a swipe's inline offset in the same frame lets the close
  // transition run from where the finger let go.
  resetDrag();
  // The button comes back at once; the card shrinks into it and fades.
  triggerHidden.value = false;
  if (motionAllowed()) await wait(CLOSE_DURATION);
  if (id !== run) return;
  rendered.value = false;
  triggerButton()?.focus({ preventScroll: true });
}

watch(open, (value) => (value ? show() : hide()));

// The layout can switch between desktop and phone while the menu is open.
watch(() => props.mobile, () => {
  if (!open.value) return;
  run++;
  triggerHidden.value = false;
  shown.value = false;
  rendered.value = false;
  open.value = false;
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) {
    e.stopPropagation();
    close();
  }
}
watch(rendered, (value) => {
  if (value) document.addEventListener("keydown", onKeydown);
  else document.removeEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  endSwipeListeners();
  stopScrollFit();
});
</script>

<style scoped>
.glass-popover {
  --glass-popover-z: 2400;
  --glass-popover-radius: 28px;
  --_dur-in: var(--menu-dur-in, 420ms);
  --_dur-out: var(--menu-dur-out, 180ms);
  --_spring: var(--menu-spring, cubic-bezier(0.34, 1.3, 0.64, 1));
  --_ease-out: var(--menu-ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

/* Above the phone's bottom menu (MobileNavPanel, z-index 9998). */
.glass-popover--phone {
  --glass-popover-z: 10000;
}

.glass-popover__trigger {
  display: inline-flex;
}

/* visibility, not v-show: the button must keep its box so the card can be
   measured against it and the bar doesn't reflow while the menu is open */
.glass-popover__trigger--hidden {
  visibility: hidden;
}

/* Phone (NEO-159): the bar avatar swells under the finger and settles back
   when the finger leaves without opening the menu. */
.glass-popover__trigger :deep([data-motion="trigger-avatar"]) {
  transition: transform 320ms var(--menu-ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.glass-popover__trigger--pressed :deep([data-motion="trigger-avatar"]) {
  transform: scale(1.12);
  transition: transform 260ms var(--menu-spring, cubic-bezier(0.34, 1.3, 0.64, 1));
}

/* A plain dim, no blur: cheap to fade on any phone. Desktop barely dims. */
.glass-popover__dim {
  position: fixed;
  inset: 0;
  z-index: var(--glass-popover-z);
  background: rgb(0 0 0 / 0.06);
  opacity: 0;
  transition: opacity var(--_dur-out) linear;
}

.glass-popover--phone .glass-popover__dim {
  background: var(--mobile-nav-scrim, rgb(0 0 0 / 0.28));
}

.glass-popover--open .glass-popover__dim {
  opacity: 1;
  transition-duration: 240ms;
}

/* The glass card. Closed it is slightly shrunk around the header avatar's
   corner and transparent; open it springs out while the avatar flies in.
   Transform + opacity only — the blur sits on the card, never animated. */
.glass-popover__card {
  position: fixed;
  z-index: calc(var(--glass-popover-z) + 1);
  outline: none;
  display: flex;
  flex-direction: column;
  width: var(--glass-popover-width, 340px);
  max-width: calc(100vw - 16px);
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  border-radius: var(--glass-popover-radius);
  background: var(--glass-surface, rgb(var(--v-theme-surface)));
  -webkit-backdrop-filter: var(--glass-blur, none);
  backdrop-filter: var(--glass-blur, none);
  box-shadow:
    inset 0 1px 0 var(--glass-edge, transparent),
    var(--glass-shadow, 0 18px 48px rgb(0 0 0 / 0.2));
  /* the header avatar's centre: that point stays put while the card grows */
  transform-origin: var(--glass-popover-origin, calc(100% - 44px) 44px);
  transform: scale(0.94);
  opacity: 0;
  will-change: transform, opacity;
  transition:
    transform var(--_dur-out) var(--_ease-out),
    opacity var(--_dur-out) linear;
}

.glass-popover--open .glass-popover__card {
  transform: none;
  opacity: 1;
  transition:
    transform var(--_dur-in) var(--_spring),
    opacity 120ms linear;
}

/* Phone: a floating capsule across the screen, like the bottom pill. */
.glass-popover--phone .glass-popover__card {
  width: auto;
  max-width: none;
}

/* The content keeps its own height; a [data-glass-scroll] part (a long
   list) takes the rest of the card and scrolls on its own (CORE-4). */
.glass-popover__card > :deep(*) {
  flex-shrink: 0;
}

.glass-popover__card > :deep([data-glass-scroll]) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Swipe: the card takes the gesture itself (no page scroll behind it). */
.glass-popover__card--swipe,
.glass-popover__card--swipe-handle :deep([data-glass-swipe]),
.glass-popover__card--swipe-handle :deep(.glass-popover__scroll--fits) {
  touch-action: none;
  user-select: none;
}

.glass-popover--dragging .glass-popover__card,
.glass-popover--dragging .glass-popover__dim {
  transition: none;
}

/* Same grabber as the bottom nav's module capsule (MobileNavPanel). */
.glass-popover__handle {
  width: 36px;
  height: 4px;
  margin: 2px auto 10px;
  border-radius: 2px;
  background: rgb(var(--v-theme-on-surface));
  opacity: 0.25;
}

/* The avatar flies from the app bar into the card's top-right corner and
   grows there (useAccountMenuMotion.placeCard sets --glass-popover-fly: the
   transform that lays it over the bar avatar). A phone press (NEO-159)
   starts the flight from the swollen size. Transform only. */
.glass-popover__card :deep([data-motion="avatar"]) {
  transform: var(--glass-popover-fly, scale(0.6)) scale(var(--_press, 1));
  transition: transform var(--_dur-out) var(--_ease-out);
}

.glass-popover--from-press .glass-popover__card :deep([data-motion="avatar"]) {
  --_press: 1.12;
}

.glass-popover--open .glass-popover__card :deep([data-motion="avatar"]) {
  transform: none;
  transition: transform 520ms var(--_spring);
}

.glass-popover__card :deep(:is([data-motion="name"], [data-motion="role"], [data-motion="extra"], [data-motion="row"])) {
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 100ms linear,
    transform 100ms linear;
}

.glass-popover--open .glass-popover__card :deep(:is([data-motion="name"], [data-motion="role"], [data-motion="extra"])) {
  opacity: 1;
  transform: none;
  transition:
    opacity 200ms linear 90ms,
    transform 260ms var(--_ease-out) 90ms;
}

.glass-popover--open .glass-popover__card :deep([data-motion="row"]) {
  opacity: 1;
  transform: none;
  transition:
    opacity 200ms linear calc(120ms + var(--glass-popover-i, 0) * 35ms),
    transform 260ms var(--_ease-out) calc(120ms + var(--glass-popover-i, 0) * 35ms);
}

/* The handle keeps its own resting look once it has faded in. */
.glass-popover--open .glass-popover__card .glass-popover__handle {
  opacity: 0.25;
}

/* No glass where the browser can't blur, or the user asked for less
   transparency: the same card in a solid surface. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-popover__card {
    background: var(--glass-solid, rgb(var(--v-theme-surface)));
  }
}

@media (prefers-reduced-transparency: reduce) {
  .glass-popover__card {
    background: var(--glass-solid, rgb(var(--v-theme-surface)));
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .glass-popover__card,
  .glass-popover__card :deep([data-motion]),
  .glass-popover__trigger :deep([data-motion="trigger-avatar"]) {
    transform: none !important;
    animation: none !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
}
</style>
