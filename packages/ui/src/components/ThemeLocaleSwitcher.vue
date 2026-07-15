<template>
  <div class="theme-locale-switcher">
    <div class="theme-locale-switcher__section">
      <p class="theme-locale-switcher__label">{{ t("user.settings.theme") }}</p>
      <VBtn
        variant="text"
        block
        density="comfortable"
        class="theme-locale-switcher__item"
        :title="theme === 'light' ? t('user.settings.theme.switchToDark') : t('user.settings.theme.switchToLight')"
        @click="$emit('toggle-theme')"
      >
        <VIcon
          :icon="theme === 'light' ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          class="theme-locale-switcher__icon"
        />
        {{ theme === "light" ? t("user.settings.theme.light") : t("user.settings.theme.dark") }}
      </VBtn>
    </div>

    <div class="theme-locale-switcher__section">
      <p class="theme-locale-switcher__label">{{ t("user.settings.language") }}</p>
      <VSelect
        :model-value="locale"
        :items="languageSelectItems"
        item-title="title"
        item-value="id"
        density="compact"
        hide-details
        variant="outlined"
        class="theme-locale-switcher__select"
        :aria-label="t('user.settings.language')"
        @update:model-value="(v) => $emit('change-locale', v as string)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { LANGUAGE_OPTIONS } from "@i18n/language-options";

defineProps<{
  theme: "light" | "dark";
  locale: string;
}>();

defineEmits<{
  "toggle-theme": [];
  "change-locale": [lang: string];
}>();

const { t } = useI18n();

const languageSelectItems = computed(() =>
  LANGUAGE_OPTIONS.map((lang) => ({
    id: lang.id,
    title: `${lang.flag} ${t(lang.labelKey)}`,
  })),
);
</script>

<style scoped>
.theme-locale-switcher__section {
  margin-bottom: 12px;
}

.theme-locale-switcher__section:last-child {
  margin-bottom: 0;
}

.theme-locale-switcher__label {
  margin: 0 0 6px 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.theme-locale-switcher__item {
  justify-content: flex-start;
  text-transform: none;
  letter-spacing: normal;
}

.theme-locale-switcher__icon {
  width: 18px;
  height: 18px;
  margin-inline-end: 8px;
}

.theme-locale-switcher__select {
  font-size: 0.875rem;
}
</style>
