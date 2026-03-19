<template>
  <div
    class="layout-app"
    :class="{
      'layout-app--sidebar-collapsed': sidebarCollapsed,
      'layout-app--mobile': isMobile,
    }"
  >
    <a
      href="#main-content"
      class="layout-app__skip-link"
      @click.prevent="focusMainContent"
      @keydown.enter.prevent="focusMainContent"
    >
      {{ t("layout.skipToMain") }}
    </a>
    <AppSidebar :collapsed="sidebarCollapsed" :theme="theme" @toggle="toggleSidebar" />

    <!-- Mobile: full-width bottom bar with menu trigger (opens drawer from bottom). -->
    <div v-show="isMobile" class="layout-app__mobile-bottom-bar" role="presentation">
      <button
        type="button"
        class="layout-app__mobile-menu-trigger"
        :title="mobileDrawerOpen ? t('layout.sidebar.collapse') : t('layout.sidebar.expand')"
        :aria-label="mobileDrawerOpen ? t('layout.sidebar.collapse') : t('layout.sidebar.expand')"
        :aria-expanded="mobileDrawerOpen"
        @click="mobileDrawerOpen = !mobileDrawerOpen"
      >
        <span class="layout-app__mobile-menu-trigger-icon" aria-hidden="true">
          <svg v-if="!mobileDrawerOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="4" rx="1"/>
            <rect x="3" y="10" width="18" height="4" rx="1"/>
            <rect x="3" y="16" width="18" height="4" rx="1"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </span>
        <span class="layout-app__mobile-menu-trigger-label">{{ mobileDrawerOpen ? t("layout.sidebar.collapse") : t("layout.sidebar.expand") }}</span>
      </button>
    </div>

    <div
      v-show="isMobile && mobileDrawerOpen"
      class="layout-app__mobile-overlay"
      aria-hidden="true"
      @click="mobileDrawerOpen = false"
    />

    <AppMobileDrawer
      ref="mobileDrawerRef"
      :open="isMobile && mobileDrawerOpen"
      :show-theme-panel-button="isAdmin"
      :user-display-name="userDisplayName"
      :user-role="userRole"
      :user-initials="userInitials"
      :user-menu-open="mobileDrawerUserMenuOpen"
      :theme="theme"
      :locale="locale"
      @close="mobileDrawerOpen = false"
      @toggle-user-menu="mobileDrawerUserMenuOpen = !mobileDrawerUserMenuOpen"
      @toggle-theme="toggleTheme"
      @change-locale="(lang: string) => setLocale(lang as 'en' | 'pl' | 'es')"
      @close-user-menu="mobileDrawerUserMenuOpen = false"
      @open-theme-panel="onOpenThemePanelFromDrawer"
      @logout="onLogout"
    />

    <div class="layout-app__main">
      <AppHeader
        ref="headerRef"
        :show-user-menu="!isMobile"
        :show-theme-panel-button="isAdmin"
        :user-display-name="userDisplayName"
        :user-role="userRole"
        :user-initials="userInitials"
        :user-menu-open="userMenuOpen"
        :theme="theme"
        :locale="locale"
        @toggle-user-menu="userMenuOpen = !userMenuOpen"
        @toggle-theme="toggleTheme"
        @change-locale="(lang: string) => onLangChange(lang as 'en' | 'pl' | 'es')"
        @close-user-menu="userMenuOpen = false"
        @open-theme-panel="themePanelOpen = true"
        @logout="onLogout"
      />
      <div class="layout-app__scroll-wrap">
        <AppGlobalLoader :active="globalLoaderActive" />
        <div
          v-show="globalLoaderActive"
          class="layout-app__loading-overlay"
          role="status"
          :aria-label="t('layout.loader.label')"
          aria-live="polite"
        />
        <main id="main-content" class="layout-app__content" role="main" tabindex="-1">
          <RouterView v-slot="{ Component }">
            <Transition name="view-fade-lift" mode="out-in">
              <component :is="Component" :key="$route.path" />
            </Transition>
          </RouterView>
        </main>
      </div>
    </div>

    <ThemePanel
      v-model="themePanelOpen"
      :config="themePanelConfig"
      :save-handler="onThemeSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import { SIDEBAR_DEFAULT_COLLAPSED, MOBILE_BREAKPOINT } from "../constants";
import { getNextTheme } from "../utils/theme";
import { getRepSettings, setRepSettings } from "../utils/rep-settings";
import { useGlobalLoader } from "../composables/useGlobalLoader";
import { repLightTheme, repDarkTheme } from "../plugins/vuetify";
import { useAuthStore } from "../stores/auth";
import { useAppConfig } from "../composables/useAppConfig";
import {
  AppSidebar,
  AppMobileDrawer,
  AppHeader,
  AppGlobalLoader,
  ThemePanel,
} from "./components";

import { loadLocale } from "../main";

const { isLoading: globalLoaderActive } = useGlobalLoader();
const router = useRouter();
const { t, locale } = useI18n();
const authStore = useAuthStore();
const appConfig = useAppConfig();

const isAdmin = computed(() => authStore.user?.role === "admin");
const themePanelOpen = ref(false);
/** Pass config value to ThemePanel (not the ref). */
const themePanelConfig = computed(() => appConfig.config.value ?? appConfig.defaults);

const theme = ref<"light" | "dark">("light");
const sidebarCollapsed = ref(SIDEBAR_DEFAULT_COLLAPSED);
const userMenuOpen = ref(false);
const headerRef = ref<InstanceType<typeof AppHeader> | null>(null);

const isMobile = ref(false);
const mobileDrawerOpen = ref(false);
const mobileDrawerUserMenuOpen = ref(false);
const mobileDrawerRef = ref<InstanceType<typeof AppMobileDrawer> | null>(null);

function updateMobile() {
  if (typeof window === "undefined") return;
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
  if (!isMobile.value) {
    mobileDrawerOpen.value = false;
    mobileDrawerUserMenuOpen.value = false;
  }
}

const userDisplayName = computed(
  () => authStore.displayName ?? authStore.user?.email ?? t("rep.user.placeholderName")
);
const userRole = computed(() => {
  const role = authStore.user?.role;
  if (role === "admin") return t("rep.user.roleAdmin");
  if (role === "manager") return t("rep.user.roleManager");
  if (role === "rep") return t("rep.user.roleRep");
  return t("rep.user.role");
});
const userInitials = computed(() => {
  const name = userDisplayName.value;
  const parts = name.trim().split(/\s+/).filter((w) => /^[a-zA-ZÀ-žżźćńółęąśŻŹĆŃÓŁĘĄŚ]/.test(w));
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
});

function closeUserMenuOnClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (!target) return;
  const el = target as HTMLElement;
  if (el instanceof HTMLSelectElement || el instanceof HTMLOptionElement || el.closest?.("select")) {
    return;
  }
  const headerEl = headerRef.value?.userWrapEl;
  if (headerEl && !headerEl.contains(target)) {
    userMenuOpen.value = false;
  }
  const drawerUserEl = mobileDrawerRef.value?.userMenuEl;
  if (drawerUserEl && !drawerUserEl.contains(target)) {
    mobileDrawerUserMenuOpen.value = false;
  }
}

function focusMainContent() {
  const el = document.getElementById("main-content");
  if (el) {
    const main = el as HTMLElement;
    main.scrollIntoView({ behavior: "smooth", block: "start" });
    main.focus({ preventScroll: false });
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  setRepSettings({ sidebarCollapsed: sidebarCollapsed.value });
}

function toggleTheme() {
  setTheme(getNextTheme(theme.value));
}

const vuetifyTheme = useTheme();
function setTheme(id: "light" | "dark") {
  theme.value = id;
  vuetifyTheme.change(id === "dark" ? repDarkTheme : repLightTheme);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", id);
    setRepSettings({ theme: id });
  }
}

function onLangChange(lang: "en" | "pl" | "es") {
  setLocale(lang);
  userMenuOpen.value = false;
}

function onLogout() {
  userMenuOpen.value = false;
  mobileDrawerUserMenuOpen.value = false;
  mobileDrawerOpen.value = false;
  authStore.clearAuth();
  router.push("/login");
}

/** Open theme panel from mobile drawer: open panel first so focus moves, then close drawer (avoids aria-hidden warning). */
function onOpenThemePanelFromDrawer() {
  themePanelOpen.value = true;
  mobileDrawerUserMenuOpen.value = false;
  nextTick(() => {
    mobileDrawerOpen.value = false;
  });
}

async function setLocale(lang: "en" | "pl" | "es") {
  await loadLocale(lang);
  locale.value = lang;
  setRepSettings({ locale: lang });
}

async function onThemeSave(cfg: import("../composables/useAppConfig").AppConfig) {
  const updated = await appConfig.save(cfg);
  if (!updated) return null;
  const fromDb = await appConfig.load();
  appConfig.applyToDom(fromDb);
  setTheme(fromDb.color_scheme);
  return fromDb;
}

onMounted(async () => {
  const settings = getRepSettings();
  if (typeof settings.sidebarCollapsed === "boolean") {
    sidebarCollapsed.value = settings.sidebarCollapsed;
  }
  const cfg = await appConfig.load();
  appConfig.applyToDom(cfg);
  setTheme(cfg.color_scheme);
  updateMobile();
  window.addEventListener("resize", updateMobile);
  document.addEventListener("click", closeUserMenuOnClickOutside);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateMobile);
  document.removeEventListener("click", closeUserMenuOnClickOutside);
});
</script>

<style lang="scss">
/* View transitions: physics-inspired, minimal. Not scoped – transition classes are on dynamic component. */
.view-fade-lift-enter-active,
.view-fade-lift-leave-active {
  transition:
    opacity 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.view-fade-lift-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.view-fade-lift-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.view-fade-lift-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.view-fade-lift-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>

<style lang="scss" scoped>
$sidebar-bg: var(--rep-sidebar-bg, #262626);
$sidebar-border: var(--rep-sidebar-border, #3a3a3a);
$sidebar-text: var(--rep-sidebar-text, #f5f5f5);
$breakpoint-mobile: 767px;
$breakpoint-desktop: 768px;

.layout-app {
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;

  &--mobile {
    :deep(.layout-app__sidebar) {
      display: none;
    }
    .layout-app__main {
      margin-left: 0;
    }
    .layout-app__header-title-wrap {
      padding-left: var(--rep-content-padding-x, 16px);
    }
    .layout-app__header::after {
      left: var(--rep-content-padding-x, 16px);
      right: var(--rep-content-padding-x, 16px);
    }
    .layout-app__content {
      padding: var(--rep-content-padding-x, 16px);
      padding-bottom: calc(12px + 44px + 12px + env(safe-area-inset-bottom, 0px));
    }
  }
}

@media (max-width: $breakpoint-mobile) {
  :deep(.layout-app__sidebar) {
    display: none !important;
  }
  .layout-app__main {
    margin-left: 0 !important;
  }
  :deep(.layout-app__header-title-wrap) {
    padding-left: var(--rep-content-padding-x, 16px) !important;
  }
  :deep(.layout-app__header::after) {
    left: var(--rep-content-padding-x, 16px) !important;
    right: var(--rep-content-padding-x, 16px) !important;
  }
  .layout-app__content {
    padding: var(--rep-content-padding-x, 16px) !important;
    padding-bottom: calc(12px + 44px + 12px + env(safe-area-inset-bottom, 0px)) !important;
  }
  :deep(.layout-app__loader) {
    margin-left: var(--rep-content-padding-x, 16px) !important;
    margin-right: var(--rep-content-padding-x, 16px) !important;
  }
}

@media (min-width: $breakpoint-desktop) {
  .layout-app__mobile-bottom-bar,
  .layout-app__mobile-overlay,
  :deep(.layout-app__mobile-drawer) {
    display: none !important;
  }
}

/* Mobile: full-width bottom bar with menu trigger (opens drawer from bottom). */
.layout-app__mobile-bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  padding: 12px var(--rep-content-padding-x, 16px) max(12px, env(safe-area-inset-bottom, 12px));
  background: var(--rep-bg, #fff);
  border-top: 1px solid var(--rep-border, #e0e0e0);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
  -webkit-tap-highlight-color: transparent;
}

[data-theme="dark"] .layout-app__mobile-bottom-bar {
  background: var(--rep-bg-secondary, #1e1e1e);
  border-top-color: var(--rep-border, #333);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.25);
}

.layout-app__mobile-menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--rep-border, #e0e0e0);
  border-radius: var(--rep-radius);
  background: var(--rep-bg-secondary, #f5f5f5);
  color: var(--rep-text, #212121);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.layout-app__mobile-menu-trigger:hover,
.layout-app__mobile-menu-trigger:focus-visible {
  background: var(--rep-sidebar-hover, rgba(0, 0, 0, 0.06));
  border-color: var(--rep-primary, #128F83);
  color: var(--rep-primary, #128F83);
  outline: none;
}

[data-theme="dark"] .layout-app__mobile-menu-trigger {
  background: var(--rep-sidebar-bg, #262626);
  border-color: var(--rep-sidebar-border, #3a3a3a);
  color: var(--rep-sidebar-text, #f5f5f5);
}

[data-theme="dark"] .layout-app__mobile-menu-trigger:hover,
[data-theme="dark"] .layout-app__mobile-menu-trigger:focus-visible {
  background: var(--rep-sidebar-hover);
  border-color: var(--rep-primary);
  color: var(--rep-primary);
}

.layout-app__mobile-menu-trigger-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
}

.layout-app__mobile-menu-trigger-icon svg {
  width: 100%;
  height: 100%;
}

.layout-app__mobile-menu-trigger-label {
  font-family: inherit;
}

/* Skip link: visible on focus for keyboard/screen reader users */
.layout-app__skip-link {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1000;
  padding: 12px 16px;
  background: var(--rep-primary, #128F83);
  color: #fff;
  font-weight: 500;
  text-decoration: none;
  border-radius: 0 0 var(--rep-radius) 0;
  transform: translateY(-100%);
  transition: transform 0.2s ease;
}
.layout-app__skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--rep-primary-hover, #10544E);
  outline-offset: 2px;
}

.layout-app__mobile-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.5);
  transition: opacity 0.25s ease;
}

/* Main content: sidebar margin + sidebar width + gap so content does not touch sidebar. */
.layout-app__main {
  position: relative;
  margin-left: calc(var(--rep-sidebar-margin, 1rem) + 220px + var(--rep-sidebar-gap, 16px));
  transition: margin-left 0.25s ease;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100vh;
  overflow: visible;
  background: var(--rep-bg, #fff);
  color: var(--rep-text, #212121);
}

.layout-app--sidebar-collapsed .layout-app__main {
  margin-left: calc(var(--rep-sidebar-margin, 1rem) + 56px + var(--rep-sidebar-gap, 16px));
}

/* Scrollable area: header stays sticky, this scrolls underneath. */
.layout-app__scroll-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.layout-app__content {
  padding: var(--rep-content-padding-x, 16px);
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.layout-app__content > * {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* Skip target: no focus ring when main receives focus (we focus it for scroll position) */
.layout-app__content:focus {
  outline: none;
}

/* When loading, block all clicks on main area (header + content) so buttons are disabled.
   Overlay is fixed (full coverage); visible part is a floating panel with margin and radius. */
.layout-app__loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
  cursor: wait;
  pointer-events: auto;
}

.layout-app__loading-overlay::before {
  content: "";
  position: absolute;
  inset: var(--rep-content-padding-x, 16px);
  border-radius: var(--rep-radius);
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] .layout-app__loading-overlay::before {
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}
</style>
