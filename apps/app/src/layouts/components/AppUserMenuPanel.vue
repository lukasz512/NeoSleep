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
          <AppIcon :name="theme === 'light' ? 'sun' : 'moon'" class="layout-app__menu-icon" />
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
          <AppIcon name="palette" class="layout-app__menu-icon" />
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
          <AppIcon name="logout" class="layout-app__menu-icon" />
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
import AppIcon from "../../components/AppIcon.vue";

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

<style scoped>
.layout-app__user-menu,
.layout-app__mobile-drawer-user-menu {
  min-width: 220px;
  padding: 12px;
  background: var(--rep-bg, #fff);
  border: 1px solid var(--rep-border, #e0e0e0);
  border-radius: var(--rep-radius);
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

.layout-app__menu-icon {
  width: 100%;
  height: 100%;
}
</style>
