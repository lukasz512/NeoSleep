<template>
  <!-- NEO-122 / NEO-154: the avatar button turns into the account menu. The
       button itself comes from the #trigger slot (so AppLayout keeps its
       styles); data-motion="trigger-*" inside it marks what the motion reads. -->
  <span
    ref="triggerWrap"
    class="account-menu__trigger"
    :class="{ 'account-menu__trigger--hidden': triggerHidden }"
    @click="toggle"
    @pointerdown="onTriggerPress"
  >
    <slot name="trigger" :open="open" />
  </span>

  <Teleport to="body">
    <!-- Same card on desktop and phone (NEO-154): its header avatar sits on
         the app bar avatar, the phone card is only wider. -->
    <div v-if="rendered" class="account-menu" :class="{ 'account-menu--phone': mobile, 'account-menu--dragging': dragging }">
      <div ref="dim" class="account-menu__dim" data-testid="account-menu-dim" @click="close" />
      <div ref="shadow" class="account-menu__shadow" aria-hidden="true" />
      <!-- The surface pours out of the avatar through a gooey threshold:
           blurred shapes cut back to a hard edge merge like liquid. -->
      <svg class="account-menu__defs" width="0" height="0" aria-hidden="true" focusable="false">
        <filter :id="liquidFilterId" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
        </filter>
      </svg>
      <div ref="liquid" class="account-menu__liquid" :style="{ filter: `url(#${liquidFilterId})` }" aria-hidden="true">
        <div ref="blob" class="account-menu__blob" />
        <div ref="drop" class="account-menu__blob account-menu__drop" />
      </div>
      <div
        ref="panel"
        class="account-menu__card"
        role="dialog"
        :aria-label="label"
        tabindex="-1"
        data-testid="account-menu"
        :class="{ 'account-menu__card--swipe': swipeable }"
        @pointerdown="onCardPointerDown"
        @click.capture="onCardClickCapture"
      >
        <slot />
        <!-- Phone: same grabber as the expanded bottom nav, so the card reads
             as something that can be swiped away (upwards, towards the bar). -->
        <div v-if="mobile" class="account-menu__handle" aria-hidden="true" data-motion="row" data-testid="account-menu-handle" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import {
  openCard, closeCard, placeCard, pressAvatar, releaseAvatar, PHONE_PRESS_SCALE, type CardParts,
} from "../../composables/useAccountMenuMotion";

const props = defineProps<{
  /** Phone: the card spans the screen width (same motion as desktop). */
  mobile: boolean;
  /** Accessible name of the dialog. */
  label: string;
}>();

const open = defineModel<boolean>("open", { default: false });

const triggerWrap = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const shadow = ref<HTMLElement | null>(null);
const dim = ref<HTMLElement | null>(null);
const liquid = ref<HTMLElement | null>(null);
const blob = ref<HTMLElement | null>(null);
const drop = ref<HTMLElement | null>(null);
const liquidFilterId = `account-menu-liquid-${useId()}`;
/** The overlay is in the DOM (open, or still animating closed). */
const rendered = ref(false);
/** The button is hidden while the menu stands in its place. */
const triggerHidden = ref(false);
/** Phone: the card fits without scrolling, so a vertical swipe can move it. */
const swipeable = ref(false);
/** The finger is moving the card right now (no spring transition while it does). */
const dragging = ref(false);
/** Bumped on every open/close so a superseded animation doesn't finish the wrong one. */
let run = 0;
/** Phone: the app bar avatar's swell under the finger, until the menu opens or the finger leaves. */
let press: Animation | null = null;

function toggle() {
  open.value = !open.value;
}

function onTriggerPress(e: PointerEvent) {
  if (!props.mobile || open.value || e.button !== 0) return;
  const avatar = pick(triggerWrap.value, "trigger-avatar");
  if (!avatar) return;
  press?.cancel();
  press = pressAvatar(avatar);
  if (!press) return;
  const done = () => {
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
    // a tap opens the menu (click comes right after pointerup); anything else lets go
    setTimeout(() => {
      if (!open.value && press) releaseAvatar(avatar, press);
      if (!open.value) press = null;
    }, 0);
  };
  window.addEventListener("pointerup", done);
  window.addEventListener("pointercancel", done);
}

function close() {
  open.value = false;
}

const pick = (root: Element | null | undefined, name: string) => root?.querySelector(`[data-motion="${name}"]`) ?? null;
const pickAll = (root: Element | null | undefined, name: string) => [...(root?.querySelectorAll(`[data-motion="${name}"]`) ?? [])];

function triggerButton(): HTMLElement | null {
  return triggerWrap.value?.querySelector<HTMLElement>("button, [role='button']") ?? null;
}

function cardParts(): CardParts | null {
  const trig = triggerWrap.value;
  const avatar = pick(panel.value, "avatar");
  const triggerAvatar = pick(trig, "trigger-avatar");
  if (!panel.value || !shadow.value || !dim.value || !liquid.value || !blob.value || !drop.value || !avatar || !triggerAvatar) return null;
  return {
    triggerAvatar,
    triggerName: pick(trig, "trigger-name"),
    triggerRole: pick(trig, "trigger-role"),
    card: panel.value,
    shadow: shadow.value,
    dim: dim.value,
    liquid: liquid.value,
    blob: blob.value,
    drop: drop.value,
    avatar,
    name: pick(panel.value, "name"),
    role: pick(panel.value, "role"),
    extras: pickAll(panel.value, "extra"),
    rows: pickAll(panel.value, "row"),
    phone: props.mobile,
    pressScale: press ? PHONE_PRESS_SCALE : 1,
  };
}

// ── Phone: swipe the card up to close it ─────────────────────────────────
/** Past this many px upwards (or a quick flick) the card closes on release. */
const SWIPE_CLOSE_DISTANCE = 64;
const SWIPE_CLOSE_VELOCITY = 0.5; // px per ms
/** A move shorter than this is still a tap. */
const SWIPE_SLOP = 6;
let swipe: { id: number; y0: number; x0: number; t0: number; dy: number; active: boolean; dimFrom: number } | null = null;
/** Set after a real drag so the click that follows pointerup doesn't hit a button. */
let swallowClick = false;

function setDrag(dy: number) {
  const card = panel.value;
  if (!card || !shadow.value || !dim.value) return;
  // up follows the finger, down only gives a little (rubber band)
  const y = dy < 0 ? dy : dy / 4;
  card.style.transform = shadow.value.style.transform = y ? `translateY(${y}px)` : "";
  const h = card.offsetHeight || 1;
  if (swipe) dim.value.style.opacity = String(swipe.dimFrom * Math.max(0, 1 + Math.min(0, dy) / h));
}

function onCardPointerDown(e: PointerEvent) {
  if (!props.mobile || !swipeable.value || !open.value || e.button !== 0) return;
  swipe = { id: e.pointerId, y0: e.clientY, x0: e.clientX, t0: e.timeStamp, dy: 0, active: false, dimFrom: Number(getComputedStyle(dim.value!).opacity) || 0 };
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
  const { active, dy, t0, dimFrom } = swipe;
  swipe = null;
  endSwipeListeners();
  if (!active) return;
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 0);
  dragging.value = false;
  const velocity = -dy / Math.max(1, e.timeStamp - t0);
  if (dy < 0 && (-dy > SWIPE_CLOSE_DISTANCE || velocity > SWIPE_CLOSE_VELOCITY)) {
    close(); // closeCard drains from where the card was let go
    return;
  }
  // not far enough: spring back (the CSS transition on the card carries it)
  if (dim.value) dim.value.style.opacity = String(dimFrom);
  setDrag(0);
}

function onCardClickCapture(e: MouseEvent) {
  if (!swallowClick) return;
  e.stopPropagation();
  e.preventDefault();
}

function resetDrag() {
  swipe = null;
  dragging.value = false;
  endSwipeListeners();
  if (panel.value) panel.value.style.transform = "";
  if (shadow.value) shadow.value.style.transform = "";
}

async function show() {
  const id = ++run;
  rendered.value = true;
  await nextTick();
  if (id !== run) return;
  const parts = cardParts();
  if (parts) {
    // measured while the button is still there, so the card lands on its avatar
    placeCard(parts);
    swipeable.value = props.mobile && parts.card.scrollHeight <= parts.card.clientHeight;
    const pressed = press;
    press = null;
    await openCard(parts, () => {
      if (id === run) triggerHidden.value = true;
    });
    // the bar avatar's swell is kept until the menu's avatar has taken over
    pressed?.cancel();
  } else {
    press?.cancel();
    press = null;
    triggerHidden.value = true;
  }
  if (id === run) panel.value?.focus({ preventScroll: true });
}

async function hide() {
  const id = ++run;
  if (!rendered.value) return;
  const reveal = () => (triggerHidden.value = false);
  const parts = cardParts();
  if (parts) await closeCard(parts, reveal);
  if (id !== run) return;
  reveal();
  resetDrag();
  rendered.value = false;
  triggerButton()?.focus({ preventScroll: true });
}

watch(open, (value) => (value ? show() : hide()));

// The layout can switch between desktop and phone while the menu is open.
watch(() => props.mobile, () => {
  if (!open.value) return;
  run++;
  triggerHidden.value = false;
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
  press?.cancel();
});
</script>

<style scoped>
.account-menu {
  --account-menu-z: 2400;
  --account-menu-radius: 24px;
}

/* Above the phone's bottom nav bar (MobileNavPanel, z-index 9998). */
.account-menu--phone {
  --account-menu-z: 10000;
}

.account-menu__trigger {
  display: inline-flex;
}

/* visibility, not v-show: the button must keep its box so the card can be
   measured against it and the bar doesn't reflow while the menu is open */
.account-menu__trigger--hidden {
  visibility: hidden;
}

.account-menu__dim {
  position: fixed;
  inset: 0;
  z-index: var(--account-menu-z);
  background: #000;
  opacity: 0;
  will-change: opacity;
}

.account-menu__shadow {
  position: fixed;
  z-index: calc(var(--account-menu-z) + 1);
  border-radius: var(--account-menu-radius);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
}

.account-menu__defs {
  position: absolute;
}

.account-menu__liquid {
  /* bounds are set per animation to the card's area (useAccountMenuMotion) */
  position: fixed;
  top: 0;
  left: 0;
  z-index: calc(var(--account-menu-z) + 2);
  pointer-events: none;
  visibility: hidden;
}

.account-menu__blob {
  position: absolute;
  background: rgb(var(--v-theme-surface));
}

.account-menu__drop {
  border-radius: 50%;
}

/* The card paints the menu's surface; the avatar sits 4px in from its top
   and end edge, so the corner radius is the avatar's radius + 4 (concentric). */
.account-menu__card {
  position: fixed;
  z-index: calc(var(--account-menu-z) + 3);
  outline: none;
  width: 340px;
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--pwa-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  border-radius: var(--account-menu-radius);
}

/* Phone: one sheet across the top of the screen, the bar's avatar in its
   corner (the header padding is set by placeCard). */
.account-menu--phone .account-menu__card,
.account-menu--phone .account-menu__shadow {
  --account-menu-radius: 0 0 24px 24px;
}

.account-menu--phone .account-menu__card {
  width: auto;
  border-width: 0 0 1px;
}

/* Swipe: the card takes the gesture itself (no page scroll behind it), and
   springs back when let go short of closing. */
.account-menu__card--swipe {
  touch-action: none;
  user-select: none;
}

.account-menu--phone .account-menu__card,
.account-menu--phone .account-menu__shadow {
  transition: transform 380ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
}

.account-menu--dragging .account-menu__card,
.account-menu--dragging .account-menu__shadow {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .account-menu--phone .account-menu__card,
  .account-menu--phone .account-menu__shadow {
    transition: none;
  }
}

/* Same grabber as the expanded bottom nav (MobileNavPanel). */
.account-menu__handle {
  width: 36px;
  height: 4px;
  margin: 2px auto 10px;
  border-radius: 2px;
  background: rgb(var(--v-theme-on-surface));
  opacity: 0.25;
}

/* While the liquid draws the surface, the card itself is only its content. */
.account-menu__card--fluid {
  background: transparent;
  border-color: transparent;
}
</style>
