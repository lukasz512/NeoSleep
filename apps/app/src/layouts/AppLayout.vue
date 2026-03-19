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
            <rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>
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
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useGlobalLoader } from "../composables/useGlobalLoader";
import { useLayoutState } from "../composables/useLayoutState";
import {
  AppSidebar,
  AppMobileDrawer,
  AppHeader,
  AppGlobalLoader,
  ThemePanel,
} from "./components";

const { isLoading: globalLoaderActive } = useGlobalLoader();
const { t } = useI18n();

const headerRef = ref<InstanceType<typeof AppHeader> | null>(null);
const mobileDrawerRef = ref<InstanceType<typeof AppMobileDrawer> | null>(null);

const {
  theme, toggleTheme, setTheme,
  sidebarCollapsed, toggleSidebar,
  isMobile, mobileDrawerOpen, mobileDrawerUserMenuOpen,
  isAdmin, userDisplayName, userRole, userInitials,
  userMenuOpen,
  locale, setLocale, onLangChange,
  onLogout,
  themePanelOpen, themePanelConfig, onThemeSave, onOpenThemePanelFromDrawer,
  focusMainContent,
} = useLayoutState();

/** Close user menus when clicking outside their containers. Uses template refs — stays in component. */
function closeUserMenuOnClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (!target) return;
  const el = target as HTMLElement;
  if (el instanceof HTMLSelectElement || el instanceof HTMLOptionElement || el.closest?.("select")) {
    return;
  }
  const headerEl = headerRef.value?.userWrapEl;
  if (headerEl && !headerEl.contains(target)) userMenuOpen.value = false;
  const drawerUserEl = mobileDrawerRef.value?.userMenuEl;
  if (drawerUserEl && !drawerUserEl.contains(target)) mobileDrawerUserMenuOpen.value = false;
}

onMounted(() => document.addEventListener("click", closeUserMenuOnClickOutside));
onUnmounted(() => document.removeEventListener("click", closeUserMenuOnClickOutside));
</script>

<style scoped src="./AppLayout.css" />
