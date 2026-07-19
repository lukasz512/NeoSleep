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
      :rail-width="64"
      :nav-items="visibleNavItems"
      :menu-label="t('layout.sidebar.expand')"
      bottom-nav-show-labels
      class="layout-shell"
    >
      <template #logo="{ location }">
        <AppLogo v-if="location === 'bar'" :theme="theme" />
      </template>

      <template #nav>
        <AppNavLinks :collapsed="!isMobile && sidebarCollapsed" @navigate="mobileDrawerOpen = false" />
      </template>

      <template #drawer-footer>
        <div v-if="!isMobile" class="layout-nav-footer" :class="{ 'layout-nav-footer--collapsed': sidebarCollapsed }">
          <VMenu
            v-model="menuOpen"
            location="end top"
            :close-on-content-click="false"
            min-width="220"
          >
            <template #activator="{ props: menuProps }">
              <AppButton
                v-bind="menuProps"
                variant="text"
                class="layout-user-btn"
                :title="t('user.user.menu')"
                :aria-label="t('user.user.menu')"
              >
                <VAvatar size="32" color="primary">
                  <span class="text-caption font-weight-bold">{{ user.initials }}</span>
                </VAvatar>
                <div v-if="!sidebarCollapsed" class="layout-user-info">
                  <span class="layout-user-name">{{ user.displayName }}</span>
                  <span class="layout-user-role">{{ user.role }}</span>
                </div>
              </AppButton>
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

          <AppButton
            icon
            variant="text"
            size="small"
            class="layout-collapse-btn"
            :title="sidebarCollapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')"
            :aria-label="sidebarCollapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')"
            @click="toggleSidebar"
          >
            <AppIcon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" class="layout-nav__chevron" />
          </AppButton>
        </div>
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
        <Transition name="title-fade" mode="out-in">
          <div :key="moduleTitle" class="layout-appbar__title-group">
            <AppIcon v-if="isMobile && moduleIcon" :name="moduleIcon" class="layout-appbar__icon" />
            <span class="layout-appbar__title">{{ moduleTitle }}</span>
          </div>
        </Transition>
      </template>

      <template #nav-icon="{ item }">
        <AppIcon :name="('nav-' + item.name) as AppIconName" />
      </template>

      <div id="main-content" tabindex="-1" class="layout-main__inner" :class="{ 'layout-main--fading': localeTransitioning }">
        <RouterView v-slot="{ Component }">
          <!-- appear: this app-layout mount is only reached right after the
               auth screen's own exit sequence finishes (see AuthView.vue),
               so the first screen the user lands on — dashboard, etc. —
               should fade in too, not pop in instantly. -->
          <Transition name="view-fade-lift" mode="out-in" appear>
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
import { navTitleKey, navIconName } from "../router/routes";
import { useI18n } from "vue-i18n";
import { AppShell } from "@ui";
import { useLayoutState } from "../composables/useLayoutState";
import { useVisibleNavRoutes } from "../composables/useVisibleNavRoutes";
import {
  AppLogo,
  AppNavLinks,
  AppUserMenuPanel,
  AppOfflineBar,
} from "./components";
import AppButton from "../components/AppButton.vue";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppNotifications from "../components/AppNotifications.vue";

const route = useRoute();
const { t, locale } = useI18n();

const {
  theme, toggleTheme,
  sidebarCollapsed, toggleSidebar,
  isMobile, mobileDrawerOpen,
  user,
  localeTransitioning, setLocale,
  onLogout,
  focusMainContent,
} = useLayoutState();

const { visibleNavItems } = useVisibleNavRoutes();

const menuOpen = ref(false);

const moduleTitle = computed(() => {
  const name = route.name;
  if (typeof name !== "string") return "";
  return t(navTitleKey(name));
});

const moduleIcon = computed(() => {
  const name = route.name;
  if (typeof name !== "string") return undefined;
  return navIconName(name) as AppIconName | undefined;
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

.layout-appbar__title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* title-fade (packages/brand/transitions.css) slides the whole group left as
   one block. Here the icon and title split apart in opposite directions on
   the way out, and converge from opposite sides on the way in, instead. */
.layout-appbar__title-group.title-fade-enter-from,
.layout-appbar__title-group.title-fade-leave-to {
  transform: none;
}

.layout-appbar__title-group.title-fade-enter-active .layout-appbar__icon,
.layout-appbar__title-group.title-fade-leave-active .layout-appbar__icon,
.layout-appbar__title-group.title-fade-enter-active .layout-appbar__title,
.layout-appbar__title-group.title-fade-leave-active .layout-appbar__title {
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.layout-appbar__title-group.title-fade-leave-to .layout-appbar__icon {
  transform: translateX(-8px);
}

.layout-appbar__title-group.title-fade-leave-to .layout-appbar__title {
  transform: translateX(8px);
}

.layout-appbar__title-group.title-fade-enter-from .layout-appbar__icon {
  transform: translateX(8px);
}

.layout-appbar__title-group.title-fade-enter-from .layout-appbar__title {
  transform: translateX(-8px);
}

.layout-appbar__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}

.layout-appbar__title {
  font-size: 1.1rem;
  font-weight: 600;
}

.layout-nav-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.layout-nav-footer--collapsed {
  flex-direction: row;
  justify-content: center;
  gap: 2px;
}

.layout-shell :deep(.app-shell__nav-footer:has(.layout-nav-footer--collapsed)) {
  padding-inline: 4px;
}

.layout-collapse-btn {
  width: 24px;
  height: 24px;
  min-width: 24px;
}

.layout-user-btn {
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-start;
  padding-inline: 8px;
  text-transform: none;
  letter-spacing: normal;
}

.layout-nav-footer--collapsed .layout-user-btn {
  flex: none;
  min-width: unset;
  padding-inline: 0;
  justify-content: center;
}

.layout-user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  margin-left: 8px;
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
