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

    <AppNotifications />
    <AppOfflineBar />

    <AppShell
      v-model="mobileDrawerOpen"
      :rail-collapsed="sidebarCollapsed"
      :nav-items="visibleNavItems"
      :menu-label="t('layout.sidebar.expand')"
      class="layout-shell"
    >
      <template #logo="{ collapsed }">
        <AppLogo variant="sidebar" :collapsed="collapsed" :theme="theme" />
      </template>

      <template #nav>
        <AppNavLinks :collapsed="!isMobile && sidebarCollapsed" @navigate="mobileDrawerOpen = false" />
      </template>

      <template #drawer-footer>
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
          drawer
          @toggle-theme="toggleTheme"
          @change-locale="(lang) => setLocale(lang as 'en' | 'pl' | 'mx')"
          @logout="onLogout"
          @close="mobileDrawerOpen = false"
        />
      </template>

      <template #app-bar-title>
        <span class="layout-appbar__title">{{ moduleTitle }}</span>
      </template>

      <template #app-bar-actions>
        <VSelect
          v-if="isAdmin"
          :model-value="rolePreviewStore.previewRole ?? 'admin'"
          :items="rolePreviewItems"
          density="compact"
          variant="outlined"
          hide-details
          class="layout-appbar__role-preview"
          :label="t('user.rolePreview.label')"
          @update:model-value="onRolePreviewChange"
        />

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
              :title="t('user.user.menu')"
              :aria-label="t('user.user.menu')"
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
            @toggle-theme="toggleTheme"
            @change-locale="(lang) => setLocale(lang as 'en' | 'pl' | 'mx')"
            @logout="onLogout"
            @close="menuOpen = false"
          />
        </VMenu>
      </template>

      <template #nav-icon="{ item }">
        <AppIcon :name="('nav-' + item.name) as AppIconName" />
      </template>

      <div id="main-content" tabindex="-1" class="layout-main__inner" :class="{ 'layout-main--fading': localeTransitioning }">
        <AppGlobalLoader :active="globalLoaderActive" />
        <RouterView v-slot="{ Component }">
          <Transition name="view-fade-lift" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </div>
    </AppShell>
  </VApp>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { navTitleKey } from "../router/routes";
import { useI18n } from "vue-i18n";
import { AppShell } from "@ui";
import { useGlobalLoader } from "../composables/useGlobalLoader";
import { useLayoutState } from "../composables/useLayoutState";
import { useVisibleNavRoutes } from "../composables/useVisibleNavRoutes";
import { useRolePreviewStore } from "../stores/rolePreview";
import type { UserRole } from "../stores/auth";
import {
  AppLogo,
  AppNavLinks,
  AppUserMenuPanel,
  AppGlobalLoader,
  AppOfflineBar,
} from "./components";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppNotifications from "../components/AppNotifications.vue";

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
  focusMainContent,
} = useLayoutState();

const { visibleNavItems } = useVisibleNavRoutes();

const menuOpen = ref(false);

const rolePreviewStore = useRolePreviewStore();
const rolePreviewItems = computed(() => [
  { title: t("user.rolePreview.admin"), value: "admin" },
  { title: t("user.rolePreview.manager"), value: "manager" },
  { title: t("user.rolePreview.rep"), value: "rep" },
  { title: t("user.rolePreview.doctor"), value: "doctor" },
]);

function onRolePreviewChange(value: string) {
  rolePreviewStore.setPreviewRole(value === "admin" ? null : (value as UserRole));
}

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
  background: var(--pwa-primary, #128F83);
  color: #fff;
  font-weight: 500;
  text-decoration: none;
  border-radius: 0 0 var(--pwa-radius) 0;
  transform: translateY(-100%);
  transition: transform 0.2s ease;
}
.layout-skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--pwa-primary-hover, #10544E);
  outline-offset: 2px;
}

.layout-shell :deep(.app-shell__nav) {
  background: var(--pwa-sidebar-bg, #262626) !important;
  color: var(--pwa-sidebar-text, #f5f5f5);
}

.layout-nav__chevron {
  width: 18px;
  height: 18px;
}

.layout-appbar__title {
  font-size: 1.1rem;
  font-weight: 600;
}

.layout-appbar__role-preview {
  max-width: 160px;
  margin-right: 8px;
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
</style>
