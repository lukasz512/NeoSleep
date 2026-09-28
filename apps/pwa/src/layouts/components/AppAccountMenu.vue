<template>
  <!-- NEO-122 / NEO-154: the avatar button turns into the account menu. The
       button itself comes from the #trigger slot (so AppLayout keeps its
       styles); data-motion="trigger-avatar" inside it is where the card lands. -->
  <span
    ref="triggerWrap"
    class="account-menu__trigger"
    :class="{ 'account-menu__trigger--hidden': triggerHidden }"
    @click="toggle"
  >
    <slot name="trigger" :open="open" />
  </span>

  <Teleport to="body">
    <!-- NEO-161 "Kropla": the same glass card on desktop and phone, springing
         out of the avatar. The motion is CSS on --open (transform + opacity),
         the same material and spring as the phone's bottom menu. -->
    <div
      v-if="rendered"
      class="account-menu"
      :class="{ 'account-menu--phone': mobile, 'account-menu--open': shown }"
    >
      <div class="account-menu__dim" data-testid="account-menu-dim" @click="close" />
      <div
        ref="panel"
        class="account-menu__card"
        role="dialog"
        :aria-label="label"
        tabindex="-1"
        data-testid="account-menu"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { CLOSE_DURATION, motionAllowed, placeCard } from "../../composables/useAccountMenuMotion";

const props = defineProps<{
  /** Phone: the card spans the screen width (same motion as desktop). */
  mobile: boolean;
  /** Accessible name of the dialog. */
  label: string;
}>();

const open = defineModel<boolean>("open", { default: false });

const triggerWrap = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
/** The overlay is in the DOM (open, or still animating closed). */
const rendered = ref(false);
/** The open state the CSS transitions to (a frame after `rendered`). */
const shown = ref(false);
/** The button is hidden while the menu stands in its place. */
const triggerHidden = ref(false);
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

/** Resolves on the next painted frame, so the closed state is drawn before --open. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function show() {
  const id = ++run;
  rendered.value = true;
  await nextTick();
  if (id !== run) return;
  const card = panel.value;
  const triggerAvatar = triggerWrap.value?.querySelector('[data-motion="trigger-avatar"]');
  if (card && triggerAvatar) {
    // measured once, while the button is still there, so the card lands on its avatar
    placeCard({ triggerAvatar, card, phone: props.mobile });
    card.querySelectorAll<HTMLElement>('[data-motion="row"]').forEach((row, i) => row.style.setProperty("--account-menu-i", String(i)));
  }
  triggerHidden.value = true;
  if (motionAllowed()) await nextFrame();
  if (id !== run) return;
  shown.value = true;
  panel.value?.focus({ preventScroll: true });
}

async function hide() {
  const id = ++run;
  if (!rendered.value) return;
  shown.value = false;
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
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.account-menu {
  --account-menu-z: 2400;
  --account-menu-radius: 28px;
  --_dur-in: var(--menu-dur-in, 420ms);
  --_dur-out: var(--menu-dur-out, 180ms);
  --_spring: var(--menu-spring, cubic-bezier(0.34, 1.3, 0.64, 1));
  --_ease-out: var(--menu-ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

/* Above the phone's bottom menu (MobileNavPanel, z-index 9998). */
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

/* A plain dim, no blur: cheap to fade on any phone. Desktop barely dims. */
.account-menu__dim {
  position: fixed;
  inset: 0;
  z-index: var(--account-menu-z);
  background: rgb(0 0 0 / 0.06);
  opacity: 0;
  transition: opacity var(--_dur-out) linear;
}

.account-menu--phone .account-menu__dim {
  background: var(--mobile-nav-scrim, rgb(0 0 0 / 0.28));
}

.account-menu--open .account-menu__dim {
  opacity: 1;
  transition-duration: 240ms;
}

/* The glass card. Closed it is shrunk into the avatar (transform-origin is
   the avatar's centre, set by placeCard) and transparent; open it springs
   out. Transform + opacity only — the blur sits on the card, never animated. */
.account-menu__card {
  position: fixed;
  z-index: calc(var(--account-menu-z) + 1);
  outline: none;
  width: 340px;
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  border-radius: var(--account-menu-radius);
  background: var(--glass-surface, rgb(var(--v-theme-surface)));
  -webkit-backdrop-filter: var(--glass-blur, none);
  backdrop-filter: var(--glass-blur, none);
  box-shadow:
    inset 0 1px 0 var(--glass-edge, transparent),
    var(--glass-shadow, 0 18px 48px rgb(0 0 0 / 0.2));
  transform-origin: var(--account-menu-origin, calc(100% - 24px) 24px);
  transform: scale(0.3);
  opacity: 0;
  will-change: transform, opacity;
  transition:
    transform var(--_dur-out) var(--_ease-out),
    opacity var(--_dur-out) linear;
}

.account-menu--open .account-menu__card {
  transform: none;
  opacity: 1;
  transition:
    transform var(--_dur-in) var(--_spring),
    opacity 120ms linear;
}

/* Phone: a floating capsule across the screen, like the bottom pill. */
.account-menu--phone .account-menu__card {
  width: auto;
}

/* The header avatar is the bar's avatar grown; the rest settles a beat
   later, one row after another. */
.account-menu__card :deep([data-motion="avatar"]) {
  transform: scale(0.8);
  transition: transform var(--_dur-out) var(--_ease-out);
}

.account-menu--open .account-menu__card :deep([data-motion="avatar"]) {
  transform: none;
  transition: transform var(--_dur-in) var(--_spring);
}

.account-menu__card :deep(:is([data-motion="name"], [data-motion="role"], [data-motion="extra"], [data-motion="row"])) {
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 100ms linear,
    transform 100ms linear;
}

.account-menu--open .account-menu__card :deep(:is([data-motion="name"], [data-motion="role"], [data-motion="extra"])) {
  opacity: 1;
  transform: none;
  transition:
    opacity 200ms linear 90ms,
    transform 260ms var(--_ease-out) 90ms;
}

.account-menu--open .account-menu__card :deep([data-motion="row"]) {
  opacity: 1;
  transform: none;
  transition:
    opacity 200ms linear calc(120ms + var(--account-menu-i, 0) * 35ms),
    transform 260ms var(--_ease-out) calc(120ms + var(--account-menu-i, 0) * 35ms);
}

/* No glass where the browser can't blur, or the user asked for less
   transparency: the same card in a solid surface. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .account-menu__card {
    background: var(--glass-solid, rgb(var(--v-theme-surface)));
  }
}

@media (prefers-reduced-transparency: reduce) {
  .account-menu__card {
    background: var(--glass-solid, rgb(var(--v-theme-surface)));
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .account-menu__card,
  .account-menu__card :deep([data-motion]) {
    transform: none !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
}
</style>
