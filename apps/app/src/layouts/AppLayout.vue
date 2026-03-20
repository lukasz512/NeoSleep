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
          <AppIcon :name="mobileDrawerOpen ? 'close' : 'menu'" class="layout-app__mobile-menu-icon" />
        </span>
        <span class="layout-app__mobile-menu-trigger-label">{{ mobileDrawerOpen ? t("layout.sidebar.collapse") : t("layout.sidebar.expand") }}</span>
      </button>
    </div>

    <AppNavDrawer
      :open="isMobile && mobileDrawerOpen"
      :show-theme-panel-button="isAdmin"
      :user-display-name="userDisplayName"
      :user-role="userRole"
      :user-initials="userInitials"
      :user-menu-open="mobileDrawerUserMenuOpen"
      :theme="theme"
      :locale="locale"
      @close="mobileDrawerOpen = false; mobileDrawerUserMenuOpen = false"
      @toggle-user-menu="mobileDrawerUserMenuOpen = !mobileDrawerUserMenuOpen"
      @toggle-theme="toggleTheme"
      @change-locale="(lang: string) => setLocale(lang as 'en' | 'pl' | 'es')"
      @close-user-menu="mobileDrawerUserMenuOpen = false"
      @open-theme-panel="onOpenThemePanelFromDrawer"
      @logout="onLogout"
    />

    <div class="layout-app__main">
      <AppHeader
        :show-user-menu="!isMobile"
        :show-theme-panel-button="isAdmin"
        :user-display-name="userDisplayName"
        :user-role="userRole"
        :user-initials="userInitials"
        :theme="theme"
        :locale="locale"
        @toggle-theme="toggleTheme"
        @change-locale="(lang: string) => onLangChange(lang as 'en' | 'pl' | 'es')"
        @open-theme-panel="themePanelOpen = true"
        @logout="onLogout"
      />
      <div class="layout-app__scroll-wrap" :class="{ 'layout-app__scroll-wrap--locale-fading': localeTransitioning }">
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
import { useI18n } from "vue-i18n";
import { useGlobalLoader } from "../composables/useGlobalLoader";
import { useLayoutState } from "../composables/useLayoutState";
import {
  AppSidebar,
  AppNavDrawer,
  AppHeader,
  AppGlobalLoader,
  ThemePanel,
} from "./components";
import AppIcon from "../components/AppIcon.vue";

const { isLoading: globalLoaderActive } = useGlobalLoader();
const { t } = useI18n();

const {
  theme, toggleTheme, setTheme,
  sidebarCollapsed, toggleSidebar,
  isMobile, mobileDrawerOpen, mobileDrawerUserMenuOpen,
  isAdmin, userDisplayName, userRole, userInitials,
  locale, localeTransitioning, setLocale, onLangChange,
  onLogout,
  themePanelOpen, themePanelConfig, onThemeSave, onOpenThemePanelFromDrawer,
  focusMainContent,
} = useLayoutState();
</script>

<style scoped src="./AppLayout.css" />
