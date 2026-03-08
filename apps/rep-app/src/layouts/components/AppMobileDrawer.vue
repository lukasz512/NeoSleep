<template>
  <div
    class="layout-app__mobile-drawer"
    :class="{ 'layout-app__mobile-drawer--open': open }"
    role="dialog"
    aria-label="Menu"
    aria-modal="true"
    :aria-hidden="open ? undefined : 'true'"
  >
    <div class="layout-app__mobile-drawer-logo">
      <AppLogo variant="drawer" @close="$emit('close')" />
    </div>
    <div class="layout-app__mobile-drawer-user" ref="userRef">
      <VBtn
        v-if="showThemePanelButton"
        variant="text"
        block
        class="layout-app__mobile-drawer-theme-btn"
        :title="t('rep.themePanel.openTitle')"
        :aria-label="t('rep.themePanel.openTitle')"
        @click="$emit('open-theme-panel'); $emit('close')"
      >
        <span class="layout-app__mobile-drawer-theme-btn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="7.5" cy="12.5" r="1"/><circle cx="10.5" cy="16.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.8-.1 2.6-.3"/></svg>
        </span>
        {{ t("rep.themePanel.title") }}
      </VBtn>
      <VBtn
        variant="text"
        block
        class="layout-app__mobile-drawer-user-trigger layout-app__mobile-drawer-user-trigger--vuetify"
        :title="t('rep.user.menu')"
        :aria-label="t('rep.user.menu')"
        :aria-expanded="userMenuOpen"
        aria-haspopup="true"
        @click="$emit('toggle-user-menu')"
      >
        <span class="layout-app__user-avatar layout-app__mobile-drawer-avatar" aria-hidden="true">{{ userInitials }}</span>
        <div class="layout-app__user-info">
          <span class="layout-app__user-name layout-app__mobile-drawer-name">{{ userDisplayName }}</span>
          <span class="layout-app__user-role">{{ userRole }}</span>
        </div>
        <span class="layout-app__user-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
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
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import AppLogo from "./AppLogo.vue";
import AppNavLinks from "./AppNavLinks.vue";
import AppUserMenuPanel from "./AppUserMenuPanel.vue";

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

defineEmits<{
  close: [];
  "toggle-user-menu": [];
  "toggle-theme": [];
  "change-locale": [lang: string];
  "close-user-menu": [];
  "open-theme-panel": [];
  logout: [];
}>();

const { t } = useI18n();
const userRef = ref<HTMLElement | null>(null);

defineExpose({
  userMenuEl: userRef,
});
</script>

<style lang="scss" scoped>
$sidebar-bg: var(--rep-sidebar-bg, #262626);
$sidebar-border: var(--rep-sidebar-border, #3a3a3a);
$sidebar-text: var(--rep-sidebar-text, #f5f5f5);
$sidebar-text-secondary: var(--rep-sidebar-text-secondary, #a0a0a0);
$sidebar-hover: var(--rep-sidebar-hover, rgba(255, 255, 255, 0.08));
$sidebar-active-bg: var(--rep-sidebar-active-bg, rgba(66, 165, 245, 0.2));

.layout-app__mobile-drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 95;
  width: 100%;
  max-height: var(--rep-drawer-max-height, 70vh);
  padding: var(--rep-content-padding-x, 16px) var(--rep-content-padding-x, 16px) max(var(--rep-content-padding-x, 16px), env(safe-area-inset-bottom, 12px)) var(--rep-content-padding-x, 16px);
  background: $sidebar-bg;
  border: none;
  border-top: 1px solid $sidebar-border;
  border-radius: var(--rep-radius) var(--rep-radius) 0 0;
  overflow: auto;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.4);
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s 0.3s;
  pointer-events: none;
  visibility: hidden;
}

.layout-app__mobile-drawer--open {
  transform: translateY(0);
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s 0s;
  pointer-events: auto;
  visibility: visible;
}

.layout-app__mobile-drawer-user {
  position: relative;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid $sidebar-border;
}

.layout-app__mobile-drawer-theme-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 8px;
  border-radius: var(--rep-radius);
  color: var(--rep-primary, #1976d2);
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.layout-app__mobile-drawer-theme-btn:hover,
.layout-app__mobile-drawer-theme-btn:focus-visible {
  background: $sidebar-hover;
  outline: none;
}

.layout-app__mobile-drawer-theme-btn :deep(.v-btn__content) {
  padding: 0;
  justify-content: flex-start;
}

.layout-app__mobile-drawer-theme-btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.layout-app__mobile-drawer-theme-btn-icon svg {
  width: 100%;
  height: 100%;
}

.layout-app__mobile-drawer-user-trigger .layout-app__user-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: auto;
  color: $sidebar-text-secondary;
  flex-shrink: 0;
}

.layout-app__mobile-drawer-user-trigger .layout-app__user-chevron svg {
  width: 100%;
  height: 100%;
}

.layout-app__mobile-drawer-user-trigger[aria-expanded="true"] .layout-app__user-chevron {
  transform: rotate(180deg);
}

.layout-app__mobile-drawer-user-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--rep-radius);
  background: transparent;
  color: $sidebar-text;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;

  &:hover,
  &:focus-visible {
    background: $sidebar-hover;
    outline: none;
  }
}

.layout-app__mobile-drawer-user-trigger--vuetify {
  justify-content: flex-start;
  text-transform: none;
  letter-spacing: normal;
  min-height: 44px;
}

.layout-app__mobile-drawer-user-trigger--vuetify :deep(.v-btn__content) {
  padding: 0;
}

.layout-app__mobile-drawer-avatar {
  width: 40px;
  height: 40px;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.layout-app__mobile-drawer-name {
  font-size: 1rem;
  font-weight: 500;
  color: $sidebar-text;
  max-width: none;
}

.layout-app__mobile-drawer-user-trigger .layout-app__user-role {
  color: $sidebar-text-secondary;
}

.layout-app__mobile-drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout-app__mobile-drawer-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  font-size: 0.875rem;
  color: $sidebar-text;
  text-decoration: none;
  border: none;
  border-radius: var(--rep-radius);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, color 0.15s;

  &:hover,
  &:focus-visible {
    background: $sidebar-hover;
    color: $sidebar-text;
    outline: none;
  }

  &--active,
  &.router-link-active {
    background: $sidebar-active-bg;
    color: var(--rep-primary, #42a5f5);
    text-decoration: none;
    border-bottom: none;
  }
}

.layout-app__mobile-drawer-logo {
  flex-shrink: 0;
  padding: 16px 0 12px;
  border-bottom: 1px solid $sidebar-border;
}

.layout-app__mobile-drawer-logo-link {
  display: flex;
  align-items: center;
  gap: 12px;
  color: $sidebar-text;
  text-decoration: none;
  padding: 8px 10px;
  -webkit-tap-highlight-color: transparent;
}

.layout-app__mobile-drawer-logo-link:active {
  opacity: 0.9;
}

.layout-app__mobile-drawer-logo-icon {
  width: 32px;
  height: 32px;
}

.layout-app__mobile-drawer-logo-text {
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.layout-app__mobile-drawer-link .layout-app__nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
</style>
