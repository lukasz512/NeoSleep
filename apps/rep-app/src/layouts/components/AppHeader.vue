<template>
  <header class="layout-app__header">
    <div class="layout-app__header-title-wrap">
      <h1 class="layout-app__module-title">{{ moduleTitle }}</h1>
    </div>
    <div class="layout-app__header-actions">
      <VBtn
        v-if="showThemePanelButton"
        icon
        variant="text"
        size="small"
        class="layout-app__theme-panel-trigger"
        :title="t('rep.themePanel.openTitle')"
        :aria-label="t('rep.themePanel.openTitle')"
        @click="$emit('open-theme-panel')"
      >
        <VIcon icon="mdi-palette" />
      </VBtn>
      <div v-show="showUserMenu" ref="userWrapRef" class="layout-app__user-wrap">
      <VBtn
        variant="text"
        class="layout-app__user-trigger layout-app__user-trigger--vuetify"
        :title="t('rep.user.menu')"
        :aria-label="t('rep.user.menu')"
        :aria-expanded="userMenuOpen"
        aria-haspopup="true"
        @click="$emit('toggle-user-menu')"
      >
        <span class="layout-app__user-avatar" aria-hidden="true">{{ userInitials }}</span>
        <div class="layout-app__user-info">
          <span class="layout-app__user-name">{{ userDisplayName }}</span>
          <span class="layout-app__user-role">{{ userRole }}</span>
        </div>
        <span class="layout-app__user-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </VBtn>
      <AppUserMenuPanel
        v-show="userMenuOpen"
        :theme="theme"
        :locale="locale"
        :show-theme-panel-button="showThemePanelButton"
        @toggle-theme="$emit('toggle-theme'); $emit('close-user-menu')"
        @change-locale="(lang: string) => $emit('change-locale', lang)"
        @open-theme-panel="$emit('open-theme-panel'); $emit('close-user-menu')"
        @logout="$emit('logout'); $emit('close-user-menu')"
        @close="$emit('close-user-menu')"
      />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import AppUserMenuPanel from "./AppUserMenuPanel.vue";

defineProps<{
  showUserMenu: boolean;
  showThemePanelButton?: boolean;
  userDisplayName: string;
  userRole: string;
  userInitials: string;
  userMenuOpen: boolean;
  theme: "light" | "dark";
  locale: string;
}>();

defineEmits<{
  "toggle-user-menu": [];
  "toggle-theme": [];
  "change-locale": [lang: string];
  "close-user-menu": [];
  "open-theme-panel": [];
  logout: [];
}>();

const route = useRoute();
const { t } = useI18n();
const userWrapRef = ref<HTMLElement | null>(null);

/** Module title from current route: t('rep.{routeName}.title'). */
const moduleTitle = computed(() => {
  const name = route.name;
  return typeof name === "string" ? t(`rep.${name}.title`) : "";
});

defineExpose({
  userWrapEl: userWrapRef,
});
</script>

<style lang="scss" scoped>
.layout-app__header {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: var(--rep-topbar-height, 56px);
  background: var(--rep-bg, #fff);
  backdrop-filter: none;
}

.layout-app__header::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: var(--rep-content-padding-x, 16px);
  right: var(--rep-content-padding-x, 16px);
  height: 1px;
  background: var(--rep-border, #e0e0e0);
}

.layout-app__header-title-wrap {
  flex: 1 1 auto;
  min-width: 0;
  padding: 16px 0 16px var(--rep-content-padding-x, 16px);
}

.layout-app__module-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--rep-text, #212121);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layout-app__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px var(--rep-content-padding-x, 16px) 16px 0;
}

.layout-app__theme-panel-trigger {
  color: var(--rep-primary, #1976d2);
  min-width: 44px;
  min-height: 44px;
}

.layout-app__theme-panel-trigger:hover {
  color: var(--rep-primary-hover, #1565c0);
  background: color-mix(in srgb, var(--rep-primary, #1976d2) 10%, transparent);
}

@media (min-width: 768px) {
  .layout-app__theme-panel-trigger {
    min-width: 40px;
    min-height: 40px;
  }
}

.layout-app__user-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  color: var(--rep-text-secondary, #666);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.layout-app__user-trigger[aria-expanded="true"] .layout-app__user-chevron {
  transform: rotate(180deg);
}

.layout-app__user-chevron svg {
  width: 100%;
  height: 100%;
}

.layout-app__user-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.layout-app__user-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--rep-text, #212121);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.layout-app__user-trigger:hover,
.layout-app__user-trigger:focus-visible {
  background: var(--rep-bg-secondary, #f5f5f5);
  border-color: var(--rep-border, #e0e0e0);
  outline: none;
}

.layout-app__user-trigger--vuetify {
  text-transform: none;
  letter-spacing: normal;
  min-height: 44px;
  min-width: 0;
}

/* Override VBtn content padding so our trigger padding controls the avatar spacing */
.layout-app__user-trigger--vuetify :deep(.v-btn__content) {
  padding: 0;
}

@media (min-width: 768px) {
  .layout-app__user-trigger--vuetify {
    min-height: 40px;
  }
}

.layout-app__user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--rep-primary, #1976d2);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  flex-shrink: 0;
}

.layout-app__user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.layout-app__user-name {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layout-app__user-role {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--rep-text-secondary, #666);
}
</style>
