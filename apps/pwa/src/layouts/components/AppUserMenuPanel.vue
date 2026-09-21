<template>
  <div :key="locale" :class="menuClass" role="menu">
    <VTooltip :text="themeTooltip" location="bottom">
      <template #activator="{ props: tooltipProps }">
        <VBtn
          v-bind="tooltipProps"
          icon
          size="48"
          variant="tonal"
          :color="theme === 'light' ? 'warning' : 'info'"
          class="layout-app__user-menu-icon-btn"
          :aria-label="themeTooltip"
          @click="$emit('toggle-theme'); $emit('close')"
        >
          <AppIcon :name="theme === 'light' ? 'sun' : 'moon'" class="layout-app__menu-icon" />
        </VBtn>
      </template>
    </VTooltip>

    <VMenu location="end top">
      <template #activator="{ props: menuProps }">
        <VTooltip :text="t('user.settings.language')" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="mergeProps(menuProps, tooltipProps)"
              icon
              size="48"
              variant="tonal"
              color="primary"
              class="layout-app__user-menu-icon-btn"
              :aria-label="t('user.settings.language')"
            >
              <AppIcon name="globe" class="layout-app__menu-icon" />
            </VBtn>
          </template>
        </VTooltip>
      </template>

      <VList density="compact">
        <VListItem
          v-for="lang in languageSelectItems"
          :key="lang.id"
          :active="lang.id === locale"
          @click="onLocaleChange(lang.id)"
        >
          <VListItemTitle>{{ lang.title }}</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>

    <VTooltip :text="t('user.settings.logOut')" location="bottom">
      <template #activator="{ props: tooltipProps }">
        <VBtn
          v-bind="tooltipProps"
          icon
          size="48"
          variant="tonal"
          color="error"
          class="layout-app__user-menu-icon-btn"
          :aria-label="t('user.settings.logOut')"
          @click="$emit('logout'); $emit('close')"
        >
          <AppIcon name="logout" class="layout-app__menu-icon" />
        </VBtn>
      </template>
    </VTooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, mergeProps } from "vue";
import { useI18n } from "vue-i18n";
import { LANGUAGE_OPTIONS } from "@i18n/language-options";
import AppIcon from "../../components/AppIcon.vue";

const props = defineProps<{
  theme: "light" | "dark";
  locale: string;
  /** When true, use drawer menu class (same styles, different BEM block) */
  drawer?: boolean;
}>();

const menuClass = computed(() =>
  props.drawer ? "layout-app__user-menu layout-app__mobile-drawer-user-menu" : "layout-app__user-menu"
);

const emit = defineEmits<{
  "toggle-theme": [];
  "change-locale": [lang: string];
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

const themeTooltip = computed(() =>
  t("user.settings.theme.tooltip", {
    current: t(props.theme === "light" ? "user.settings.theme.light" : "user.settings.theme.dark"),
    next: t(props.theme === "light" ? "user.settings.theme.dark" : "user.settings.theme.light"),
  })
);

function onLocaleChange(value: string) {
  emit("change-locale", value);
  emit("close");
}
</script>

<style scoped>
.layout-app__user-menu,
.layout-app__mobile-drawer-user-menu {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  background: var(--pwa-bg, #fff);
  border: 1px solid var(--pwa-border, #e0e0e0);
  border-radius: var(--pwa-radius);
}

.layout-app__user-menu-icon-btn {
  flex-shrink: 0;
}

.layout-app__menu-icon {
  width: 24px;
  height: 24px;
}
</style>
