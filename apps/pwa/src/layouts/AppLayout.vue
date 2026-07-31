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
            <AppIcon v-if="moduleIcon" :name="moduleIcon" class="layout-appbar__icon" />
            <span class="layout-appbar__title">{{ moduleTitle }}</span>
          </div>
        </Transition>
      </template>

      <template #nav-icon="{ item }">
        <span class="layout-appbar__nav-icon-wrap">
          <AppIcon :name="('nav-' + item.name) as AppIconName" />
          <span
            v-if="item.name === 'dashboard' && unreadCount > 0"
            class="layout-appbar__nav-dot"
            aria-hidden="true"
          />
        </span>
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
import { ref, computed, onMounted, onUnmounted } from "vue";
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
import { useNotificationCenter } from "../composables/useNotificationCenter";
import { onAppReady, markAppReady } from "../composables/useAppReady";
import { usePartnerResources } from "../composables/usePartnerResources";

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

// AppLayout is mounted for the whole authenticated session, so it — not
// AppNotificationCenter.vue, which now only renders on DashboardView — owns
// the unread-count polling lifecycle. That's what keeps the nav badge dots
// (sidebar + bottom nav) live while the rep is on any other screen.
const { unreadCount, startPolling, stopPolling } = useNotificationCenter();
onMounted(startPolling);
onUnmounted(stopPolling);

// Silently warms the OrthoApnea session + resources cache in the background
// as soon as the app shell is up, so ResourcesView.vue doesn't pay that
// latency itself later — see useAppReady.ts. No toast here: the connection
// notification lives in the router guard (router/index.ts), triggered when
// the rep actually navigates into a partner-dependent route (`meta.partner`)
// — that's also where a failed connection gets retried, via
// usePartnerConnection.ts's ensurePartnerConnection(). A rep who never opens
// Resources is never interrupted; one who does gets both a retry attempt and
// (rate-limited) feedback if it's still down.
const { load: loadPartnerResources } = usePartnerResources();
onAppReady(() => void loadPartnerResources(locale.value));
onMounted(markAppReady);

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

/* AppShell's VNavigationDrawer (`.app-shell__nav`) is themed entirely via its
   own `color="surface-container-low"` prop (packages/ui/AppShell.vue) —
   Vuetify's standard theme-color mechanism, no override needed here. */

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
  width: var(--appbar-row, 28px);
  height: var(--appbar-row, 28px);
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}

.layout-appbar__nav-icon-wrap {
  position: relative;
  display: inline-flex;
}

.layout-appbar__nav-dot {
  position: absolute;
  top: -2px;
  left: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pwa-error, #d32f2f);
  border: 1.5px solid var(--pwa-bg, #fff);
}

.layout-appbar__nav-dot::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--pwa-error, #d32f2f);
  animation: notif-dot-pulse 1.8s ease-out infinite;
}

@keyframes notif-dot-pulse {
  0%   { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(2.4); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .layout-appbar__nav-dot::before {
    animation: none;
  }
}

.layout-appbar__title {
  font-size: 20px;
  font-weight: 600;
  line-height: var(--appbar-row, 28px);
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

:deep(.app-shell__nav-footer:has(.layout-nav-footer--collapsed)) {
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
