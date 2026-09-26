<template>
  <!-- NEO-102 (option C): who you are, then every setting as a one-tap
       segmented control (no submenus), then account actions, log out set
       apart at the bottom, and the app version as the last line. -->
  <div
    :key="locale"
    class="user-menu"
    :class="{ 'user-menu--sheet': sheet }"
    :aria-label="t('user.user.menu')"
  >
    <div class="user-menu__identity">
      <VAvatar size="40" color="primary" rounded="lg">
        <span class="text-body-medium font-weight-bold">{{ initials }}</span>
      </VAvatar>
      <div class="user-menu__who">
        <span class="user-menu__name">{{ name }}</span>
        <span v-if="email && email !== name" class="user-menu__email">{{ email }}</span>
        <span class="user-menu__role">
          {{ roleLabel }}
          <span v-if="region" class="user-menu__region">{{ region }}</span>
        </span>
      </div>
    </div>

    <div class="user-menu__settings">
      <div class="user-menu__setting">
        <span :id="themeLabelId" class="user-menu__label">{{ t('user.settings.theme') }}</span>
        <AppSegmentedTabs
          :model-value="themePreference"
          :options="themeOptions"
          :aria-labelledby="themeLabelId"
          data-testid="user-menu-theme"
          @update:model-value="onThemeChange"
        />
      </div>
      <div class="user-menu__setting">
        <span :id="languageLabelId" class="user-menu__label">{{ t('user.settings.language') }}</span>
        <AppSegmentedTabs
          :model-value="locale"
          :options="languageOptions"
          :aria-labelledby="languageLabelId"
          data-testid="user-menu-language"
          @update:model-value="onLocaleChange"
        />
      </div>
    </div>

    <div v-if="canChangePassword || installMethod" class="user-menu__actions">
      <button
        v-if="canChangePassword"
        type="button"
        class="user-menu__row"
        data-testid="user-menu-change-password"
        @click="$emit('change-password'); $emit('close')"
      >
        <AppIcon name="key" class="user-menu__row-icon" />
        {{ t('user.settings.changePassword') }}
      </button>
      <!-- NEO-87 (variant E): always reachable while the app isn't added yet,
           so "Later" on the card is never a dead end. Opens the same card. -->
      <button
        v-if="installMethod"
        type="button"
        class="user-menu__row"
        data-testid="app-install-menu-item"
        @click="cardOpen = true; $emit('close')"
      >
        <AppIcon name="install" class="user-menu__row-icon" />
        {{ t(`layout.install.title.${device.form}`) }}
      </button>
    </div>

    <div class="user-menu__logout-wrap">
      <VBtn
        variant="outlined"
        color="error"
        block
        class="user-menu__logout"
        data-testid="user-menu-logout"
        @click="$emit('logout'); $emit('close')"
      >
        <AppIcon name="logout" class="user-menu__row-icon" />
        {{ t('user.settings.logOut') }}
      </VBtn>
    </div>

    <div v-if="version" class="user-menu__version" data-testid="user-menu-version">
      <span>{{ version }}</span>
      <span v-if="channel" class="user-menu__channel">{{ channel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";
import type { ThemePreference } from "@stores";
import { LANGUAGE_OPTIONS } from "@i18n/language-options";
import AppIcon from "../../components/AppIcon.vue";
import { useInstallPrompt } from "../../composables/useInstallPrompt";

defineProps<{
  /** Phone: full-width bottom sheet instead of the desktop drop-down card. */
  sheet?: boolean;
  name: string;
  email?: string;
  roleLabel: string;
  initials: string;
  /** Country code shown as a small tag next to the role (e.g. "MX"). */
  region?: string;
  themePreference: ThemePreference;
  locale: string;
  /** False for Google-only accounts — they have no password to change. */
  canChangePassword: boolean;
  /** "Version 1.0.0 (build 105)" — empty hides the line. */
  version: string;
  /** "DEV" / "LOCAL" on non-prod builds, null on prod. */
  channel: string | null;
}>();

const emit = defineEmits<{
  "set-theme": [preference: ThemePreference];
  "change-locale": [lang: string];
  "change-password": [];
  logout: [];
  close: [];
}>();

const { t } = useI18n();
const { device, method: installMethod, cardOpen } = useInstallPrompt();
const themeLabelId = useId();
const languageLabelId = useId();

const themeOptions = computed(() => [
  { value: "light", label: t("user.settings.theme.light") },
  { value: "dark", label: t("user.settings.theme.dark") },
  { value: "system", label: t("user.settings.theme.auto") },
]);

// Native names on purpose: someone who switched to a language they can't
// read must still be able to find their own. The "(MX)" suffix is dropped —
// a third of a 340px menu can't hold "Español (MX)" whole.
const languageOptions = LANGUAGE_OPTIONS.map((lang) => ({
  value: lang.id,
  label: lang.nativeLabel.replace(/\s*\(.*\)$/, ""),
}));

function isThemePreference(value: string): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

// Theme stays open so the change can be seen and undone in place; a language
// change re-renders the whole app, so the menu closes with it.
function onThemeChange(value: string) {
  if (isThemePreference(value)) emit("set-theme", value);
}

function onLocaleChange(value: string) {
  emit("change-locale", value);
  emit("close");
}
</script>

<style scoped>
.user-menu {
  width: 340px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--pwa-border, rgba(var(--v-border-color), var(--v-border-opacity)));
  border-radius: var(--pwa-radius);
  overflow: hidden;
}

.user-menu--sheet {
  width: 100%;
  border: 0;
  border-radius: 16px 16px 0 0;
  /* Keep the version line above the home indicator. */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.user-menu__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 12px;
}

.user-menu__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.user-menu__name {
  font-size: 0.9375rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__email,
.user-menu__role {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__role {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-menu__region {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.user-menu__settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.user-menu__setting {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-menu__label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.user-menu__actions {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.user-menu__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 16px;
  font: inherit;
  font-size: 0.875rem;
  color: inherit;
  text-align: start;
  background: none;
  border: 0;
  cursor: pointer;
}

.user-menu__row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.user-menu__row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.user-menu__row-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* theme.scss pads every button 24px as a pill CTA; this one is a full-width
   menu action, set apart from the rows above so it isn't hit by accident. */
.user-menu__logout-wrap {
  padding: 12px 16px 0;
}

.user-menu__logout.v-btn {
  min-height: 44px;
  gap: 8px;
  text-transform: none;
  letter-spacing: normal;
}

.user-menu__version {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px 14px;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.user-menu__channel {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  border-radius: 4px;
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.14);
}
</style>
