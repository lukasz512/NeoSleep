<template>
  <!-- NEO-122: the avatar button turns into the account menu. The button
       itself comes from the #trigger slot (so AppLayout keeps its styles);
       data-motion="trigger-*" inside it marks what the motion reads. -->
  <span
    ref="triggerWrap"
    class="account-menu__trigger"
    :class="{ 'account-menu__trigger--hidden': triggerHidden }"
    @click="toggle"
  >
    <slot name="trigger" :open="open" />
  </span>

  <Teleport to="body">
    <div v-if="rendered" class="account-menu" :class="mobile ? 'account-menu--sheet' : 'account-menu--card'">
      <div ref="dim" class="account-menu__dim" data-testid="account-menu-dim" @click="close" />
      <template v-if="!mobile">
        <div ref="shadow" class="account-menu__shadow" aria-hidden="true" />
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
      </template>
      <div
        v-else
        ref="panel"
        class="account-menu__sheet"
        role="dialog"
        :aria-label="label"
        tabindex="-1"
        data-testid="account-menu"
      >
        <div class="account-menu__grab" aria-hidden="true" />
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { openCard, closeCard, openSheet, closeSheet, placeCard, type CardParts, type SheetParts } from "../../composables/useAccountMenuMotion";

const props = defineProps<{
  /** Phone: bottom sheet instead of the card that grows out of the button. */
  mobile: boolean;
  /** Accessible name of the dialog. */
  label: string;
}>();

const open = defineModel<boolean>("open", { default: false });

const triggerWrap = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const shadow = ref<HTMLElement | null>(null);
const dim = ref<HTMLElement | null>(null);
/** The overlay is in the DOM (open, or still animating closed). */
const rendered = ref(false);
/** The button is hidden while the menu stands in its place. */
const triggerHidden = ref(false);
/** Bumped on every open/close so a superseded animation doesn't finish the wrong one. */
let run = 0;

function toggle() {
  open.value = !open.value;
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
  if (!panel.value || !shadow.value || !dim.value || !avatar || !triggerAvatar) return null;
  return {
    triggerAvatar,
    triggerName: pick(trig, "trigger-name"),
    triggerRole: pick(trig, "trigger-role"),
    card: panel.value,
    shadow: shadow.value,
    dim: dim.value,
    avatar,
    name: pick(panel.value, "name"),
    role: pick(panel.value, "role"),
    extras: pickAll(panel.value, "extra"),
    rows: pickAll(panel.value, "row"),
  };
}

function sheetParts(): SheetParts | null {
  const avatar = pick(panel.value, "avatar") as HTMLElement | null;
  const triggerAvatar = pick(triggerWrap.value, "trigger-avatar") as HTMLElement | null;
  if (!panel.value || !dim.value || !avatar || !triggerAvatar) return null;
  return {
    triggerAvatar,
    sheet: panel.value,
    scrim: dim.value,
    avatar,
    header: pick(panel.value, "header"),
    rows: pickAll(panel.value, "row"),
  };
}

async function show() {
  const id = ++run;
  rendered.value = true;
  await nextTick();
  if (id !== run) return;
  const button = triggerButton();
  if (props.mobile) {
    const parts = sheetParts();
    if (parts) await openSheet(parts, () => (triggerHidden.value = true));
  } else {
    const parts = cardParts();
    if (parts) {
      // measured before the button hides, so the card lands on its avatar
      placeCard(parts);
      parts.card.style.visibility = "hidden";
      await openCard(parts, button ?? parts.card, () => {
        parts.card.style.visibility = "";
        triggerHidden.value = true;
      });
    }
  }
  if (id === run) panel.value?.focus({ preventScroll: true });
}

async function hide() {
  const id = ++run;
  if (!rendered.value) return;
  const reveal = () => (triggerHidden.value = false);
  if (props.mobile) {
    const parts = sheetParts();
    if (parts) await closeSheet(parts, reveal);
  } else {
    const parts = cardParts();
    if (parts) await closeCard(parts, reveal, triggerButton() ?? parts.card);
  }
  if (id !== run) return;
  reveal();
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
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<style>
/* The bloom animates the mask radius; registering it lets the browser
   interpolate it (unregistered custom properties would jump). */
@property --r {
  syntax: "<length>";
  inherits: false;
  initial-value: 2000px;
}
</style>

<style scoped>
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
  z-index: 2400;
  background: #000;
  opacity: 0;
}

.account-menu__shadow {
  position: fixed;
  z-index: 2401;
  border-radius: var(--pwa-radius);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
}

/* Soft-edged circle around the avatar: fully solid inside r − 36px, fading
   out to r. At rest r is huge, so the whole card shows. */
.account-menu__card {
  position: fixed;
  z-index: 2402;
  outline: none;
  -webkit-mask-image: radial-gradient(circle at var(--bloom-x, 100%) var(--bloom-y, 0), #000 calc(var(--r) - 36px), transparent var(--r));
  mask-image: radial-gradient(circle at var(--bloom-x, 100%) var(--bloom-y, 0), #000 calc(var(--r) - 36px), transparent var(--r));
}

/* Above the phone's bottom nav bar (MobileNavPanel, z-index 9998). */
.account-menu--sheet .account-menu__dim {
  z-index: 10000;
}

.account-menu__sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10001;
  outline: none;
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  border-radius: 16px 16px 0 0;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
}

.account-menu__grab {
  width: 36px;
  height: 4px;
  margin: 8px auto 0;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.15);
}
</style>
