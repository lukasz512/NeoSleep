<template>
  <Transition name="nav-drawer-fade">
    <div
      v-show="open"
      class="app-nav-drawer__overlay"
      aria-hidden="true"
      @click="$emit('close')"
    />
  </Transition>

  <aside
    class="app-nav-drawer"
    :class="{ 'app-nav-drawer--open': open }"
    :style="swipeStyle"
    role="dialog"
    :aria-label="t('layout.nav.drawer')"
    aria-modal="true"
    :aria-hidden="open ? undefined : 'true'"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <div class="app-nav-drawer__header">
      <AppLogo variant="drawer" :theme="theme" @close="$emit('close')" />
    </div>

    <div class="app-nav-drawer__user">
      <VBtn
        v-if="showThemePanelButton"
        variant="text"
        block
        class="app-nav-drawer__theme-btn"
        :title="t('rep.themePanel.openTitle')"
        :aria-label="t('rep.themePanel.openTitle')"
        @click="$emit('open-theme-panel'); $emit('close')"
      >
        <span class="app-nav-drawer__btn-icon" aria-hidden="true">
          <AppIcon name="palette" class="app-nav-drawer__icon" />
        </span>
        {{ t("rep.themePanel.title") }}
      </VBtn>

      <VBtn
        variant="text"
        block
        class="app-nav-drawer__user-trigger"
        :title="t('rep.user.menu')"
        :aria-label="t('rep.user.menu')"
        :aria-expanded="userMenuOpen"
        aria-haspopup="true"
        @click="$emit('toggle-user-menu')"
      >
        <span class="app-nav-drawer__avatar" aria-hidden="true">{{ userInitials }}</span>
        <div class="app-nav-drawer__user-info">
          <span class="app-nav-drawer__user-name">{{ userDisplayName }}</span>
          <span class="app-nav-drawer__user-role">{{ userRole }}</span>
        </div>
        <span class="app-nav-drawer__chevron" aria-hidden="true">
          <AppIcon name="chevron-down" class="app-nav-drawer__icon" />
        </span>
      </VBtn>

      <AppUserMenuPanel
        v-show="userMenuOpen"
        :theme="theme"
        :locale="locale"
        :show-theme-panel-button="showThemePanelButton"
        drawer
        @toggle-theme="$emit('toggle-theme'); $emit('close-user-menu')"
        @change-locale="$emit('change-locale', $event); $emit('close-user-menu')"
        @open-theme-panel="$emit('open-theme-panel'); $emit('close-user-menu')"
        @logout="$emit('logout'); $emit('close-user-menu')"
        @close="$emit('close-user-menu')"
      />
    </div>

    <AppNavLinks variant="drawer" @navigate="$emit('close')" />
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import AppLogo from "./AppLogo.vue";
import AppNavLinks from "./AppNavLinks.vue";
import AppUserMenuPanel from "./AppUserMenuPanel.vue";
import AppIcon from "../../components/AppIcon.vue";

defineProps<{
  open: boolean;
  showThemePanelButton?: boolean;
  userDisplayName: string;
  userRole: string;
  userInitials: string;
  userMenuOpen: boolean;
  theme: "light" | "dark";
  locale: string;
}>();

const emit = defineEmits<{
  close: [];
  "toggle-user-menu": [];
  "toggle-theme": [];
  "change-locale": [lang: string];
  "close-user-menu": [];
  "open-theme-panel": [];
  logout: [];
}>();

const { t } = useI18n();

const drawerX = ref(0);
let touchStartX = 0;

const swipeStyle = computed(() =>
  drawerX.value ? { transform: `translateX(${drawerX.value}px)`, transition: "none" } : {}
);

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0]!.clientX;
}

function onTouchMove(e: TouchEvent) {
  const delta = e.touches[0]!.clientX - touchStartX;
  if (delta < 0) drawerX.value = delta;
}

function onTouchEnd() {
  if (drawerX.value < -72) {
    emit("close");
  }
  drawerX.value = 0;
}
</script>

<style scoped>
.app-nav-drawer__overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.5);
}

.nav-drawer-fade-enter-active,
.nav-drawer-fade-leave-active {
  transition: opacity 0.25s ease;
}

.nav-drawer-fade-enter-from,
.nav-drawer-fade-leave-to {
  opacity: 0;
}

.app-nav-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 95;
  width: min(280px, 85vw);
  padding: max(var(--rep-content-padding-x, 16px), env(safe-area-inset-top, 16px))
    var(--rep-content-padding-x, 16px)
    max(var(--rep-content-padding-x, 16px), env(safe-area-inset-bottom, 16px));
  background: var(--rep-sidebar-bg, #262626);
  border-right: 1px solid var(--rep-sidebar-border, #3a3a3a);
  box-shadow: 4px 0 32px rgba(0, 0, 0, 0.35);
  overflow-y: auto;
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s 0.3s;
  pointer-events: none;
  visibility: hidden;
}

.app-nav-drawer--open {
  transform: translateX(0);
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s 0s;
  pointer-events: auto;
  visibility: visible;
}

.app-nav-drawer__header {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rep-sidebar-border, #3a3a3a);
}

.app-nav-drawer__user {
  position: relative;
  margin-top: 8px;
  margin-bottom: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rep-sidebar-border, #3a3a3a);
}

.app-nav-drawer__theme-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: var(--rep-radius);
  color: var(--rep-primary, #128F83);
  text-transform: none;
  letter-spacing: normal;
  -webkit-tap-highlight-color: transparent;
}

.app-nav-drawer__theme-btn :deep(.v-btn__content) {
  padding: 0;
  justify-content: flex-start;
}

.app-nav-drawer__theme-btn:hover,
.app-nav-drawer__theme-btn:focus-visible {
  background: var(--rep-sidebar-hover, rgba(255, 255, 255, 0.08));
  outline: none;
}

.app-nav-drawer__btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.app-nav-drawer__icon {
  width: 100%;
  height: 100%;
}

.app-nav-drawer__user-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--rep-radius);
  color: var(--rep-sidebar-text, #f5f5f5);
  text-transform: none;
  letter-spacing: normal;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
  justify-content: flex-start;
}

.app-nav-drawer__user-trigger :deep(.v-btn__content) {
  padding: 0;
}

.app-nav-drawer__user-trigger:hover,
.app-nav-drawer__user-trigger:focus-visible {
  background: var(--rep-sidebar-hover, rgba(255, 255, 255, 0.08));
  outline: none;
}

.app-nav-drawer__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--rep-primary, #128F83);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  flex-shrink: 0;
}

.app-nav-drawer__user-info {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.app-nav-drawer__user-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--rep-sidebar-text, #f5f5f5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-nav-drawer__user-role {
  font-size: 0.75rem;
  color: var(--rep-sidebar-text-secondary, rgba(245, 245, 245, 0.6));
}

.app-nav-drawer__chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.app-nav-drawer__user-trigger[aria-expanded="true"] .app-nav-drawer__chevron {
  transform: rotate(180deg);
}
</style>
