<template>
  <!-- NEO-102 (final): who you are; one row per setting with its name on the
       left and one-tap icons on the right (theme: sun / moon / auto, language:
       flags); the two account actions as a matching pair of buttons, log out
       told apart only by colour; the app version as the last line. -->
  <div
    :key="locale"
    class="user-menu"
    :class="{ 'user-menu--sheet': sheet }"
    :aria-label="t('user.user.menu')"
  >
    <div class="user-menu__identity">
      <VAvatar size="44" color="primary" rounded="lg">
        <span class="text-body-large font-weight-bold">{{ initials }}</span>
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
        <span :id="themeLabelId" class="user-menu__setting-name">{{ t('user.settings.theme') }}</span>
        <div
          role="radiogroup"
          class="user-menu__choices"
          :aria-labelledby="themeLabelId"
          data-testid="user-menu-theme"
        >
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            role="radio"
            class="user-menu__choice"
            :class="{ 'user-menu__choice--on': option.value === themePreference }"
            :aria-checked="option.value === themePreference"
            :aria-label="option.label"
            :title="option.label"
            @click="$emit('set-theme', option.value)"
          >
            <AppIcon :name="option.icon" class="user-menu__choice-icon" />
          </button>
        </div>
      </div>
      <div class="user-menu__setting">
        <span :id="languageLabelId" class="user-menu__setting-name">{{ t('user.settings.language') }}</span>
        <div
          role="radiogroup"
          class="user-menu__choices"
          :aria-labelledby="languageLabelId"
          data-testid="user-menu-language"
        >
          <!-- Native names in the label: someone who switched to a language
               they can't read must still be able to find their own. -->
          <button
            v-for="lang in LANGUAGE_OPTIONS"
            :key="lang.id"
            type="button"
            role="radio"
            class="user-menu__choice"
            :class="{ 'user-menu__choice--on': lang.id === locale }"
            :aria-checked="lang.id === locale"
            :aria-label="lang.nativeLabel"
            :title="lang.nativeLabel"
            @click="onLocaleChange(lang.id)"
          >
            <AppFlag :locale="lang.id" />
          </button>
        </div>
      </div>
    </div>

    <!-- NEO-87 (variant E): always reachable while the app isn't added yet,
         so "Later" on the card is never a dead end. Opens the same card. -->
    <button
      v-if="installMethod"
      type="button"
      class="user-menu__row"
      data-testid="app-install-menu-item"
      @click="cardOpen = true; $emit('close')"
    >
      <AppIcon name="install" class="user-menu__action-icon" />
      {{ t(`layout.install.title.${device.form}`) }}
    </button>

    <div class="user-menu__actions" :class="{ 'user-menu__actions--single': !canChangePassword }">
      <button
        v-if="canChangePassword"
        type="button"
        class="user-menu__action"
        :title="t('user.settings.changePassword')"
        :aria-label="t('user.settings.changePassword')"
        data-testid="user-menu-change-password"
        @click="$emit('change-password'); $emit('close')"
      >
        <AppIcon name="key" class="user-menu__action-icon" />
        {{ t('user.settings.password') }}
      </button>
      <button
        type="button"
        class="user-menu__action user-menu__action--logout"
        data-testid="user-menu-logout"
        @click="$emit('logout'); $emit('close')"
      >
        <AppIcon name="logout" class="user-menu__action-icon" />
        {{ t('user.settings.logOut') }}
      </button>
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
import type { ThemePreference } from "@stores";
import { LANGUAGE_OPTIONS } from "@i18n/language-options";
import AppIcon, { type AppIconName } from "../../components/AppIcon.vue";
import AppFlag from "../../components/AppFlag.vue";
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

// Theme stays open on change so it can be seen and undone in place.
const themeOptions = computed<{ value: ThemePreference; icon: AppIconName; label: string }[]>(() => [
  { value: "light", icon: "sun", label: t("user.settings.theme.light") },
  { value: "dark", icon: "moon", label: t("user.settings.theme.dark") },
  { value: "system", icon: "circle-half", label: t("user.settings.theme.auto") },
]);

// A language change re-renders the whole app, so the menu closes with it.
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
  gap: 14px;
  padding: 18px 16px 14px;
}

.user-menu__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.user-menu__name {
  font-size: 1rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__email,
.user-menu__role {
  font-size: 0.8125rem;
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
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.07);
}

.user-menu__settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px 12px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.user-menu__setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.user-menu__setting-name {
  font-size: 0.9375rem;
}

/* One-tap choice group: a tinted track, the chosen one lifts out as a white
   tile. 48×40 per choice keeps every icon a comfortable touch target. */
.user-menu__choices {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.user-menu__choice {
  display: grid;
  place-items: center;
  width: 48px;
  height: 40px;
  border: 0;
  border-radius: 9px;
  background: none;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  transition: background-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
}

.user-menu__choice:hover:not(.user-menu__choice--on) {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.user-menu__choice:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.user-menu__choice--on {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
}

/* The chosen flag gets a primary ring — a flag can't change colour to show it. */
.user-menu__choice--on :deep(.app-flag) {
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
}

.user-menu__choice-icon {
  width: 22px;
  height: 22px;
}

.user-menu__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 0 16px;
  font: inherit;
  font-size: 0.875rem;
  color: inherit;
  text-align: start;
  background: none;
  border: 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}

.user-menu__row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.user-menu__row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

/* The two account actions: same shape, size and icon style — log out differs
   only in colour. One full-width button when there's no password to change. */
.user-menu__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 14px 16px 4px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.user-menu__actions--single {
  grid-template-columns: 1fr;
}

.user-menu__action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.06);
  cursor: pointer;
  transition: background-color 160ms ease;
}

.user-menu__action:hover {
  background: rgba(var(--v-theme-on-surface), 0.1);
}

.user-menu__action:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.user-menu__action--logout {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.08);
}

.user-menu__action--logout:hover {
  background: rgba(var(--v-theme-error), 0.14);
}

.user-menu__action-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
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

@media (prefers-reduced-motion: reduce) {
  .user-menu__choice,
  .user-menu__action {
    transition: none;
  }
}
</style>
