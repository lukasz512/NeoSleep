<template>
  <VApp>
    <a
      href="#main-content"
      class="layout-skip-link"
      @click.prevent="focusMainContent"
      @keydown.enter.prevent="focusMainContent"
    >
      {{ t("layout.skipToMain") }}
    </a>

    <AppOfflineBar />

    <VNavigationDrawer
      v-model="mobileDrawerOpen"
      :rail="!isMobile && sidebarCollapsed"
      :permanent="!isMobile"
      :temporary="isMobile"
      width="220"
      :rail-width="56"
      class="layout-nav"
    >
      <AppLogo variant="sidebar" :collapsed="!isMobile && sidebarCollapsed" :theme="theme" />
      <AppNavLinks variant="sidebar" :collapsed="!isMobile && sidebarCollapsed" />

      <template #append>
        <VDivider />
        <div class="layout-nav__footer">
          <VBtn
            v-if="!isMobile"
            icon
            variant="text"
            size="small"
            :title="sidebarCollapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')"
            :aria-label="sidebarCollapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')"
            @click="toggleSidebar"
          >
            <AppIcon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" class="layout-nav__chevron" />
          </VBtn>
          <AppUserMenuPanel
            v-else
            :theme="theme"
            :locale="(locale as string)"
            :show-theme-panel-button="isAdmin"
            drawer
            @toggle-theme="toggleTheme"
            @change-locale="(lang) => setLocale(lang as 'en' | 'pl' | 'mx')"
            @open-theme-panel="onOpenThemePanelFromDrawer"
            @logout="onLogout"
            @close="mobileDrawerOpen = false"
          />
        </div>
      </template>
    </VNavigationDrawer>

    <VAppBar flat border="b" :height="56">
      <template v-if="isMobile" #prepend>
        <VAppBarNavIcon @click="mobileDrawerOpen = !mobileDrawerOpen" />
      </template>

      <VAppBarTitle class="layout-appbar__title">{{ moduleTitle }}</VAppBarTitle>

      <template #append>
        <VBtn
          v-if="isAdmin"
          icon
          variant="text"
          size="small"
          :title="t('rep.themePanel.openTitle')"
          :aria-label="t('rep.themePanel.openTitle')"
          @click="themePanelOpen = true"
        >
          <AppIcon name="palette" class="layout-appbar__icon" />
        </VBtn>

        <VMenu
          v-if="!isMobile"
          v-model="menuOpen"
          location="bottom end"
          :close-on-content-click="false"
          min-width="220"
        >
          <template #activator="{ props: menuProps }">
            <VBtn
              v-bind="menuProps"
              variant="text"
              class="layout-user-btn"
              :title="t('rep.user.menu')"
              :aria-label="t('rep.user.menu')"
            >
              <div class="layout-user-info">
                <span class="layout-user-name">{{ user.displayName }}</span>
                <span class="layout-user-role">{{ user.role }}</span>
              </div>
              <VAvatar size="32" color="primary" class="ml-2">
                <span class="text-caption font-weight-bold">{{ user.initials }}</span>
              </VAvatar>
            </VBtn>
          </template>

          <AppUserMenuPanel
            :theme="theme"
            :locale="(locale as string)"
            :show-theme-panel-button="isAdmin"
            @toggle-theme="toggleTheme"
            @change-locale="(lang) => setLocale(lang as 'en' | 'pl' | 'mx')"
            @open-theme-panel="themePanelOpen = true"
            @logout="onLogout"
            @close="menuOpen = false"
          />
        </VMenu>
      </template>
    </VAppBar>

    <VMain :class="{ 'layout-main--fading': localeTransitioning }">
      <div id="main-content" tabindex="-1" class="layout-main__inner">
        <AppGlobalLoader :active="globalLoaderActive" />
        <RouterView v-slot="{ Component }">
          <Transition name="view-fade-lift" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </div>
    </VMain>

    <ThemePanel
      v-model="themePanelOpen"
      :config="themePanelConfig"
      :save-handler="onThemeSave"
    />
  </VApp>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { navTitleKey } from "../router/routes";
import { useI18n } from "vue-i18n";
import { useGlobalLoader } from "../composables/useGlobalLoader";
import { useLayoutState } from "../composables/useLayoutState";
import {
  AppLogo,
  AppNavLinks,
  AppUserMenuPanel,
  AppGlobalLoader,
  ThemePanel,
  AppOfflineBar,
} from "./components";
import AppIcon from "../components/AppIcon.vue";

const { isLoading: globalLoaderActive } = useGlobalLoader();
const route = useRoute();
const { t, locale } = useI18n();

const {
  theme, toggleTheme,
  sidebarCollapsed, toggleSidebar,
  isMobile, mobileDrawerOpen,
  isAdmin, user,
  localeTransitioning, setLocale,
  onLogout,
  themePanelOpen, themePanelConfig, onThemeSave, onOpenThemePanelFromDrawer,
  focusMainContent,
} = useLayoutState();

const menuOpen = ref(false);

const moduleTitle = computed(() => {
  const name = route.name;
  if (typeof name !== "string") return "";
  return t(navTitleKey(name));
});
</script>

<style scoped>
.layout-skip-link {
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
.layout-skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--rep-primary-hover, #10544E);
  outline-offset: 2px;
}

.layout-nav {
  background: var(--rep-sidebar-bg, #262626) !important;
  color: var(--rep-sidebar-text, #f5f5f5);
}

.layout-nav__footer {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.layout-nav__chevron {
  width: 18px;
  height: 18px;
}

.layout-appbar__title {
  font-size: 1.1rem;
  font-weight: 600;
}

.layout-appbar__icon {
  width: 20px;
  height: 20px;
}

.layout-user-btn {
  text-transform: none;
  letter-spacing: normal;
}

.layout-user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 0;
}

.layout-user-name {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layout-user-role {
  font-size: 0.7rem;
  font-weight: 400;
  line-height: 1.2;
  opacity: var(--v-medium-emphasis-opacity);
  white-space: nowrap;
}

.layout-main--fading {
  opacity: 0;
  transition: opacity 180ms ease;
}

.layout-main__inner {
  padding: 16px;
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.layout-main__inner:focus {
  outline: none;
}

.layout-main__inner > * {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.view-fade-lift-enter-active,
.view-fade-lift-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.view-fade-lift-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.view-fade-lift-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
