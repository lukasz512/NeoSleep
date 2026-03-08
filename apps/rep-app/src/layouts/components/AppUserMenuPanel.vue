<template>
  <div :key="locale" :class="menuClass" role="menu">
    <div class="layout-app__user-menu-section">
      <p class="layout-app__user-menu-label">{{ t("rep.settings.theme") }}</p>
      <VBtn
        variant="text"
        block
        density="comfortable"
        class="layout-app__user-menu-item layout-app__user-menu-item--vuetify"
        :title="theme === 'light' ? t('rep.settings.theme.switchToDark') : t('rep.settings.theme.switchToLight')"
        @click="$emit('toggle-theme'); $emit('close')"
      >
        <span class="layout-app__theme-icon" aria-hidden="true">
          <svg v-if="theme === 'light'" class="layout-app__icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 6a6 6 0 0 1 0 12"/>
          </svg>
          <svg v-else class="layout-app__icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </span>
        {{ theme === "light" ? t("rep.settings.theme.light") : t("rep.settings.theme.dark") }}
      </VBtn>
    </div>
    <div v-if="showThemePanelButton" class="layout-app__user-menu-section">
      <VBtn
        variant="text"
        block
        density="comfortable"
        class="layout-app__user-menu-item layout-app__user-menu-item--vuetify"
        :title="t('rep.themePanel.openTitle')"
        :aria-label="t('rep.themePanel.openTitle')"
        @click="$emit('open-theme-panel'); $emit('close')"
      >
        <span class="layout-app__theme-icon" aria-hidden="true">
          <svg class="layout-app__icon-palette" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="7.5" cy="12.5" r="1"/><circle cx="10.5" cy="16.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.8-.1 2.6-.3"/></svg>
        </span>
        {{ t("rep.themePanel.title") }}
      </VBtn>
    </div>
    <div class="layout-app__user-menu-section">
      <p class="layout-app__user-menu-label">{{ t("rep.settings.language") }}</p>
      <VSelect
        :model-value="locale"
        :items="languageSelectItems"
        item-title="title"
        item-value="id"
        density="compact"
        hide-details
        variant="outlined"
        class="layout-app__user-menu-select"
        :aria-label="t('rep.settings.language')"
        @update:model-value="onLocaleChange"
      />
    </div>
    <div class="layout-app__user-menu-section">
      <VBtn
        variant="text"
        block
        density="comfortable"
        class="layout-app__user-menu-item layout-app__user-menu-item--vuetify"
        :title="t('rep.settings.logOut')"
        :aria-label="t('rep.settings.logOut')"
        @click="$emit('logout'); $emit('close')"
      >
        <span class="layout-app__theme-icon" aria-hidden="true">
          <svg class="layout-app__icon-logout" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </span>
        {{ t("rep.settings.logOut") }}
      </VBtn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { LANGUAGE_OPTIONS } from "@i18n/language-options";

const props = defineProps<{
  theme: "light" | "dark";
  locale: string;
  /** When true, use drawer menu class (same styles, different BEM block) */
  drawer?: boolean;
  /** When true, show "Theme & style" menu item (admin). */
  showThemePanelButton?: boolean;
}>();

const menuClass = computed(() =>
  props.drawer ? "layout-app__user-menu layout-app__mobile-drawer-user-menu" : "layout-app__user-menu"
);

const emit = defineEmits<{
  "toggle-theme": [];
  "change-locale": [lang: string];
  "open-theme-panel": [];
  logout: [];
  close: [];
}>();

const { t } = useI18n();

const languageSelectItems = computed(() =>
  LANGUAGE_OPTIONS.map((lang) => ({
    id: lang.id,
    title: `${lang.flag} ${t(lang.labelKey)}`,
  }))
);

function onLocaleChange(value: string) {
  emit("change-locale", value);
  emit("close");
}
</script>

<style lang="scss" scoped>
.layout-app__user-menu,
.layout-app__mobile-drawer-user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  padding: 12px;
  background: var(--rep-bg, #fff);
  border: 1px solid var(--rep-border, #e0e0e0);
  border-radius: var(--rep-radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: visible;
}

.layout-app__user-menu-section {
  margin-bottom: 12px;
}

.layout-app__user-menu-section:last-child {
  margin-bottom: 0;
}

.layout-app__user-menu-label {
  margin: 0 0 6px 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--rep-text-secondary, #666);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* VBtn as menu item: text variant, left-aligned content, icon + text */
.layout-app__user-menu-item--vuetify {
  justify-content: flex-start;
  text-transform: none;
  letter-spacing: normal;
}

.layout-app__user-menu-item .layout-app__theme-icon {
  width: 18px;
  height: 18px;
  margin-inline-end: 8px;
}

/* VSelect: compact in menu, use theme variables */
.layout-app__user-menu-select {
  font-size: 0.875rem;
}

.layout-app__user-menu-select :deep(.v-field) {
  border-radius: var(--rep-radius);
}

.layout-app__icon-sun,
.layout-app__icon-moon,
.layout-app__icon-logout,
.layout-app__icon-palette {
  width: 100%;
  height: 100%;
}
</style>
