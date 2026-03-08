<template>
  <aside
    class="layout-app__sidebar"
    :class="{ 'layout-app__sidebar--collapsed': collapsed }"
    aria-label="App navigation"
  >
    <div class="layout-app__sidebar-content">
      <AppLogo variant="sidebar" :collapsed="collapsed" />
      <AppNavLinks variant="sidebar" :collapsed="collapsed" />
    </div>
    <div class="layout-app__sidebar-footer">
      <VBtn
        icon
        variant="flat"
        class="layout-app__sidebar-toggle layout-app__sidebar-toggle--vuetify"
        :title="toggleLabel"
        :aria-label="toggleLabel"
        @click="$emit('toggle')"
      >
        <svg class="layout-app__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path v-if="collapsed" d="M9 18l6-6-6-6"/>
          <path v-else d="M15 18l-6-6 6-6"/>
        </svg>
      </VBtn>
    </div>
    <div
      class="layout-app__sidebar-slide-handle"
      aria-hidden="true"
      @pointerdown="onSlideStart"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppLogo from "./AppLogo.vue";
import AppNavLinks from "./AppNavLinks.vue";

const SLIDE_THRESHOLD = 50;

const props = defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const { t } = useI18n();
let slideStartX = 0;

const toggleLabel = computed(() =>
  props.collapsed ? t("layout.sidebar.expand") : t("layout.sidebar.collapse"),
);

function onSlideStart(e: PointerEvent) {
  slideStartX = e.clientX;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  (e.target as HTMLElement).addEventListener("pointerup", onSlideEnd);
  (e.target as HTMLElement).addEventListener("pointercancel", onSlideEnd);
}

function onSlideEnd(e: PointerEvent) {
  const target = e.target as HTMLElement;
  target.releasePointerCapture(e.pointerId);
  target.removeEventListener("pointerup", onSlideEnd);
  target.removeEventListener("pointercancel", onSlideEnd);
  const deltaX = e.clientX - slideStartX;
  if (deltaX > SLIDE_THRESHOLD && props.collapsed) emit("toggle");
  if (deltaX < -SLIDE_THRESHOLD && !props.collapsed) emit("toggle");
}
</script>

<style lang="scss" scoped>
$sidebar-bg: var(--rep-sidebar-bg, #262626);
$sidebar-border: var(--rep-sidebar-border, #3a3a3a);
$sidebar-text: var(--rep-sidebar-text, #f5f5f5);
$sidebar-text-secondary: var(--rep-sidebar-text-secondary, #a0a0a0);
$sidebar-hover: var(--rep-sidebar-hover, rgba(255, 255, 255, 0.08));
$sidebar-active-bg: var(--rep-sidebar-active-bg, rgba(66, 165, 245, 0.2));

/* Sidebar: minimal app frame, no heavy “card” look. */
.layout-app__sidebar {
  position: fixed;
  left: var(--rep-sidebar-margin, 1rem);
  top: var(--rep-sidebar-margin, 1rem);
  bottom: var(--rep-sidebar-margin, 1rem);
  display: flex;
  flex-direction: column;
  width: 220px;
  padding: 16px;
  background: $sidebar-bg;
  border: 1px solid $sidebar-border;
  border-radius: var(--rep-radius);
  transition:
    width 0.25s ease,
    padding 0.25s ease,
    border-radius 0.25s ease;
  overflow: hidden;
  z-index: 10;

  &--collapsed {
    width: 56px;
    padding: 16px 8px;
  }
}

.layout-app__sidebar-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content {
  align-items: center;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__logo) {
  align-self: center;
  width: fit-content;
}

/* Nav is inside AppNavLinks; :deep() so these styles apply */
.layout-app__sidebar-content :deep(.layout-app__nav) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
  overflow: hidden;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__nav) {
  align-items: center;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__nav-list) {
  width: fit-content;
  max-width: 100%;
  align-self: center;
}

.layout-app__sidebar-content :deep(.layout-app__nav-link) {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  font-size: 0.875rem;
  color: $sidebar-text;
  text-decoration: none;
  border: none;
  border-radius: var(--rep-radius);
  transition:
    background 0.15s ease,
    color 0.15s ease,
    padding 0.25s ease,
    gap 0.25s ease;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;

  /* Expanded: no button-like hover. Collapsed: subtle hover for feedback. */
  &:hover,
  &:focus-visible {
    color: $sidebar-text;
    outline: none;
  }
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__nav-link:hover),
.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__nav-link:focus-visible) {
  background: $sidebar-hover;
}

.layout-app__sidebar-content :deep(.layout-app__nav-link--active),
.layout-app__sidebar-content :deep(.layout-app__nav-link.router-link-active) {
  background: $sidebar-active-bg;
  color: var(--rep-primary, #42a5f5);
  text-decoration: none;
  border-bottom: none;
  box-shadow: none;
}

.layout-app__sidebar-content :deep(.layout-app__nav-link--active .layout-app__nav-icon),
.layout-app__sidebar-content :deep(.layout-app__nav-link.router-link-active .layout-app__nav-icon) {
  color: inherit;
}

.layout-app__sidebar-content :deep(.layout-app__nav-icon) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.layout-app__sidebar-content :deep(.layout-app__nav-icon svg) {
  width: 100%;
  height: 100%;
}

.layout-app__sidebar-content :deep(.layout-app__nav-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  transition: opacity 0.2s ease, max-width 0.25s ease;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__nav-link) {
  padding: 10px 8px;
  justify-content: center;
  gap: 0;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.v-list-item__prepend) {
  margin-inline-start: 0;
  margin-inline-end: 0;
}

/* Collapsed: content (label) takes no space so icon stays centered */
.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__nav-link .v-list-item__content) {
  flex: 0 0 0;
  min-width: 0;
  max-width: 0;
  overflow: hidden;
  padding: 0;
  margin: 0;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-content :deep(.layout-app__nav-text) {
  max-width: 0;
  min-width: 0;
  opacity: 0;
  visibility: hidden;
  overflow: hidden;
}

.layout-app__sidebar-footer {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 20px;
  padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
  border-top: 1px solid $sidebar-border;
  display: flex;
  justify-content: center;
  transition: padding 0.25s ease;
}

.layout-app__sidebar--collapsed .layout-app__sidebar-footer {
  padding-top: 20px;
  padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
}

/* Toggle matches nav icons: no border, same hover/focus as nav links; no lift on hover */
.layout-app__sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--rep-radius);
  background: transparent;
  color: $sidebar-text-secondary;
  transition: background 0.15s, color 0.15s;
  -webkit-tap-highlight-color: transparent;
  transform: none;

  &:hover,
  &:focus-visible {
    background: $sidebar-hover;
    color: var(--rep-primary, #42a5f5);
    outline: none;
    transform: none;
  }
}

.layout-app__sidebar-toggle--vuetify {
  width: 44px;
  height: 44px;
  padding: 0;
  min-width: 44px;
  min-height: 44px;
}

.layout-app__chevron {
  width: 18px;
  height: 18px;
}

/* Slide handle: drag right to expand, drag left to collapse (desktop). Hidden on mobile. */
.layout-app__sidebar-slide-handle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 20px;
  cursor: col-resize;
  -webkit-tap-highlight-color: transparent;
}
</style>
