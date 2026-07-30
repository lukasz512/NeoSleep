<template>
  <Transition name="fade">
    <div
      v-show="modelValue"
      class="mobile-nav-drawer__overlay"
      aria-hidden="true"
      @click="close"
    />
  </Transition>

  <Transition name="slide">
    <aside
      v-show="modelValue"
      class="mobile-nav-drawer__panel"
      :style="swipeStyle"
      :aria-label="ariaLabel"
      role="dialog"
      aria-modal="true"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div v-if="$slots.header" class="mobile-nav-drawer__header">
        <slot name="header" />
      </div>
      <nav class="mobile-nav-drawer__nav" :aria-label="ariaLabel">
        <slot />
      </nav>
      <div v-if="$slots.footer" class="mobile-nav-drawer__footer">
        <slot name="footer" />
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

/**
 * Shared mobile hamburger-drawer mechanics (packages/ui) — overlay, slide-in
 * panel, swipe-to-close. Ported from apps/web's DefaultHeader, which already
 * had this feel right; apps/pwa's mobile drawer now uses this too instead of
 * Vuetify's own VNavigationDrawer transition, so both apps share one feel.
 *
 * Deliberately has no knowledge of nav content — header/default/footer slots
 * let each app plug in its own (pwa: logo + nav links + user menu; web:
 * search box + nav links + search results).
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    width?: number | string;
    ariaLabel?: string;
  }>(),
  {
    width: 300,
    ariaLabel: "Mobile navigation",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

function close() {
  emit("update:modelValue", false);
}

const panelWidth = computed(() =>
  typeof props.width === "number" ? `${props.width}px` : props.width,
);

// ── Swipe to close ────────────────────────────────────────────────────────
const drawerX = ref(0);
let touchStartX = 0;

const swipeStyle = computed(() => {
  const style: Record<string, string> = { width: panelWidth.value };
  if (drawerX.value) {
    style.transform = `translateX(${drawerX.value}px)`;
    style.transition = "none";
  }
  return style;
});

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0]!.clientX;
}

function onTouchMove(e: TouchEvent) {
  const delta = e.touches[0]!.clientX - touchStartX;
  if (delta < 0) drawerX.value = delta;
}

function onTouchEnd() {
  if (drawerX.value < -72) {
    drawerX.value = 0;
    close();
  } else {
    drawerX.value = 0;
  }
}
</script>

<style scoped>
.mobile-nav-drawer__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  /* Above both apps' app bars (web's .site-header is 9999; Vuetify's
     VAppBar/VNavigationDrawer sit in the ~1000-2000 range). */
  z-index: 10000;
}

.mobile-nav-drawer__panel {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  background: var(--mobile-nav-drawer-bg, #fff);
  color: var(--mobile-nav-drawer-text, #111);
  border-right: 1px solid var(--mobile-nav-drawer-border, rgba(0, 0, 0, 0.12));
  transition: background-color 0.35s ease, color 0.35s ease, border-color 0.35s ease;
}

.mobile-nav-drawer__header {
  flex-shrink: 0;
}

.mobile-nav-drawer__nav {
  flex: 1;
  overflow-y: auto;
}

.mobile-nav-drawer__footer {
  flex-shrink: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
