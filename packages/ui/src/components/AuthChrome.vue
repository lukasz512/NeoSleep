<template>
  <FluidCursorTrail />

  <div class="auth-chrome__topbar">
    <VMenu
      v-model="settingsMenuOpen"
      location="bottom end"
      :close-on-content-click="false"
      min-width="220"
    >
      <template #activator="{ props: menuProps }">
        <VBtn
          v-bind="menuProps"
          icon
          variant="text"
          size="small"
          color="primary"
          :aria-label="t('user.settings.menu')"
          :title="t('user.settings.menu')"
        >
          <VIcon icon="mdi-cog-outline" />
        </VBtn>
      </template>
      <VCard class="auth-chrome__settings-card">
        <ThemeLocaleSwitcher
          :theme="theme"
          :locale="locale"
          @toggle-theme="toggleTheme"
          @change-locale="onChangeLocale"
        />
      </VCard>
    </VMenu>
  </div>

  <div class="auth-chrome__logo-wrap" :class="{ 'auth-chrome__logo-wrap--visible': logoVisible }">
    <BrandLogo
      :dark="theme === 'dark'"
      :light-src="configStore.config.logo_url"
      :dark-src="configStore.config.logo_dark_url"
      :alt="t('user.login.logoAlt')"
      class="auth-chrome__logo"
    />
    <img
      :src="pwaBadgeUrl"
      :alt="t('user.login.pwaBadge')"
      class="auth-chrome__pwa-badge"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import { en as vuetifyEn, pl as vuetifyPl, es as vuetifyEs } from "vuetify/locale";
import { createConfigStore, useThemeStore } from "@stores";
import { BRAND_PWA_BADGE_URL } from "@brand/logos";
import { loadLocaleMessages, type SupportedLocale } from "@i18n/loadLocale";
import type { ApiFetchOptions } from "@api";
import ThemeLocaleSwitcher from "./ThemeLocaleSwitcher.vue";
import BrandLogo from "./BrandLogo.vue";
import FluidCursorTrail from "./FluidCursorTrail.vue";

const pwaBadgeUrl = BRAND_PWA_BADGE_URL;

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

const i18n = useI18n();
const { t, locale } = i18n;

const settingsMenuOpen = ref(false);
const vuetifyTheme = useTheme();
const themeStore = useThemeStore();
const theme = computed<"light" | "dark">(() => themeStore.mode);

// Vuetify's own theme instance is app-local (scoped to <v-app>/component tree) and
// doesn't know about the shared theme store, so it needs an explicit sync — same
// pattern as useLayoutState.ts. The store itself already keeps <html data-theme>
// (and every var(--pwa-*) custom property, incl. the page background) in sync.
watch(theme, (mode) => vuetifyTheme.change(mode), { immediate: true, flush: "sync" });

function toggleTheme() {
  themeStore.toggleMode();
}

const vuetifyLocales: Record<SupportedLocale, Record<string, unknown>> = {
  en: vuetifyEn,
  pl: vuetifyPl,
  mx: vuetifyEs,
};

async function onChangeLocale(lang: string) {
  const next = lang as SupportedLocale;
  await loadLocaleMessages(i18n, next, { $vuetify: vuetifyLocales[next] });
  locale.value = next;
}

const apiFetch = inject<ApiFetchFn>("neo:apiFetch")!;

const useConfigStore = createConfigStore(apiFetch);
const configStore = useConfigStore();

// Entrance/exit choreography for the logo+badge, mirroring AnimatedCard's
// pattern: emerges from below on mount; playExit() (called by the auth view
// on successful login, before the card itself exits and the app appears)
// reverses that, so the whole screen retracts logo → card → in that order.
const LOGO_EXIT_DURATION = 300;

const logoVisible = ref(false);
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

onMounted(async () => {
  if (prefersReducedMotion) {
    logoVisible.value = true;
    return;
  }
  await nextTick();
  logoVisible.value = true;
});

async function playExit(): Promise<void> {
  if (prefersReducedMotion) return;
  logoVisible.value = false;
  await wait(LOGO_EXIT_DURATION);
}

defineExpose({ playExit });
</script>

<style scoped>
.auth-chrome__topbar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
}

.auth-chrome__settings-card {
  min-width: 220px;
  padding: 12px;
}

/* Fixed-height anchor: the logo never moves, whatever height the card below
   it animates to — it's the one stable point on the screen the layout is
   built around, not something that recenters with the content. Emerges from
   below on mount, and retracts the same way via playExit() (see script). */
.auth-chrome__logo-wrap {
  position: relative;
  z-index: 1;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  height: 110px;
  justify-content: center;
  margin-bottom: 24px;
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.auth-chrome__logo-wrap--visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .auth-chrome__logo-wrap {
    transition: none;
  }
}

.auth-chrome__logo {
  width: 260px;
  height: auto;
  object-fit: contain;
}

.auth-chrome__pwa-badge {
  height: 24px;
  width: auto;
  object-fit: contain;
}
</style>
