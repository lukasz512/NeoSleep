<template>
  <div :key="locale" :class="menuClass" role="menu">
    <div class="layout-app__user-menu-row">
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

    <!-- NEO-87 (variant E): always reachable while the app isn't added yet,
         so "Later" on the card is never a dead end. Opens the same card. -->
    <VBtn
      v-if="installMethod"
      variant="tonal"
      color="primary"
      block
      class="layout-app__user-menu-install"
      data-testid="app-install-menu-item"
      @click="cardOpen = true; $emit('close')"
    >
      <AppIcon name="install" class="layout-app__menu-install-icon" />
      {{ t(`layout.install.title.${device.form}`) }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
import { computed, mergeProps } from "vue";
import { useI18n } from "vue-i18n";
import { LANGUAGE_OPTIONS } from "@i18n/language-options";
import AppIcon from "../../components/AppIcon.vue";
import { useInstallPrompt } from "../../composables/useInstallPrompt";

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
const { device, method: installMethod, cardOpen } = useInstallPrompt();

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
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding: 12px;
  background: var(--pwa-bg, #fff);
  border: 1px solid var(--pwa-border, #e0e0e0);
  border-radius: var(--pwa-radius);
}

.layout-app__user-menu-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.layout-app__user-menu-icon-btn {
  flex-shrink: 0;
}

/* theme.scss pads every non-icon button 24px (pill CTA); a menu row wants the
   compact padding so the label fits the 220px panel. */
.layout-app__user-menu .layout-app__user-menu-install.v-btn {
  padding-inline: 12px !important;
  text-transform: none;
  letter-spacing: normal;
  white-space: normal;
  height: auto;
  min-height: 40px;
}

.layout-app__menu-install-icon {
  width: 20px;
  height: 20px;
  margin-inline-end: 8px;
  flex-shrink: 0;
}

.layout-app__menu-icon {
  width: 24px;
  height: 24px;
}
</style>
