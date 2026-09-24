<template>
  <AuthDotGridBackground :dark="theme === 'dark'" />

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
    <!-- Both below are separate from this entrance-transition element: this
         one owns the mount/exit transform (translateY + opacity transition),
         each of them owns its own continuous per-frame magnetic transform
         (see useMagneticPointer) — combining either into one CSS transition
         would fight the rAF loop. Two different strengths (see script) so
         halo/logo visibly separate in depth instead of moving as one block.
         The PWA badge lives in AuthView now, below the card, not here. -->
    <div ref="haloMagnetEl" class="auth-chrome__halo" />
    <div ref="logoMagnetEl" class="auth-chrome__logo-magnet">
      <BrandLogo
        :dark="theme === 'dark'"
        :light-src="configStore.config.logo_url"
        :dark-src="configStore.config.logo_dark_url"
        :alt="t('user.login.logoAlt')"
        class="auth-chrome__logo"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import { en as vuetifyEn, pl as vuetifyPl, es as vuetifyEs } from "vuetify/locale";
import { createConfigStore, useThemeStore } from "@stores";
import { loadLocaleMessages, type SupportedLocale } from "@i18n/loadLocale";
import type { ApiFetchOptions } from "@api";
import { useMagneticPointer } from "../composables/useMagneticPointer";
import ThemeLocaleSwitcher from "./ThemeLocaleSwitcher.vue";
import BrandLogo from "./BrandLogo.vue";
import AuthDotGridBackground from "./AuthDotGridBackground.vue";

// Card no longer moves at all (see AuthView) — only the logo does, which
// floats more than the halo behind it (nearly still, "leciutko"/lightly).
const haloMagnetEl = ref<HTMLElement | null>(null);
const logoMagnetEl = ref<HTMLElement | null>(null);
useMagneticPointer(haloMagnetEl, { strength: 8, ease: 0.05 });
useMagneticPointer(logoMagnetEl, { strength: 5, ease: 0.12 });

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

// autoPlay=false lets a parent (see AuthView) stage this logo's entrance
// alongside other elements instead of it firing the moment this mounts.
const { autoPlay = true } = defineProps<{ autoPlay?: boolean }>();

// Entrance/exit choreography for the logo, mirroring AnimatedCard's
// pattern: emerges from below on mount; playExit() (called by the auth view
// on successful login, before the card itself exits and the app appears)
// reverses that, so the whole screen retracts logo → card → in that order.
const LOGO_ENTER_DURATION = 400;
const LOGO_EXIT_DURATION = 300;

const logoVisible = ref(false);
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playEnter(): Promise<void> {
  if (prefersReducedMotion) {
    logoVisible.value = true;
    return;
  }
  await nextTick();
  logoVisible.value = true;
  await wait(LOGO_ENTER_DURATION);
}

onMounted(() => {
  if (autoPlay) playEnter();
});

async function playExit(): Promise<void> {
  if (prefersReducedMotion) return;
  logoVisible.value = false;
  await wait(LOGO_EXIT_DURATION);
}

defineExpose({ playEnter, playExit });
</script>

<style scoped>
/* Its own translucent surface chip — without this the icon button was
   invisible against the dot field wherever a dot happened to sit behind it.
   --v-theme-surface already tracks light/dark, same var AuthCard relies on
   for its own theming. */
.auth-chrome__topbar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.75);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(6px);
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
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  margin-bottom: -11px;
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

/* Soft blurred halo behind the logo — the dot field is busy enough that it
   needs a bit of contrast lift to stay legible. White in light mode (light
   bg, so a bright halo separates it), dark in dark mode. First in the DOM
   (see template) so it paints behind its sibling without needing an explicit
   z-index; absolutely positioned so it takes no space in the flex layout.
   Own (very light) magnetic transform — "leciutko" — so it isn't a dead,
   static backdrop either. */
.auth-chrome__halo {
  position: absolute;
  inset: -30px -70px;
  background: radial-gradient(ellipse, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 72%);
  filter: blur(26px);
  pointer-events: none;
  will-change: transform;
}

[data-theme="dark"] .auth-chrome__halo {
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 72%);
}

/* Magnetic transform target (see useMagneticPointer in <script>) — written to
   directly every frame, so it stays free of any CSS transition of its own. */
.auth-chrome__logo-magnet {
  display: flex;
  will-change: transform;
}

.auth-chrome__logo {
  width: 260px;
  height: auto;
  object-fit: contain;
}
</style>
