<template>
  <VApp class="layout-root" :class="{ 'layout-root--desktop': !isMobile }">
    <a
      href="#main-content"
      class="layout-skip-link"
      @click.prevent="focusMainContent"
      @keydown.enter.prevent="focusMainContent"
    >
      {{ t("layout.skipToMain") }}
    </a>

    <AppOfflineBar />

    <AppShell
      :rail-collapsed="sidebarCollapsed"
      :rail-width="64"
      :nav-items="visibleNavItems"
      :menu-label="t('layout.nav.modules')"
      :more-label="t('layout.nav.more')"
      :more-title="t('layout.nav.moreModules')"
      bottom-nav-show-labels
    >
      <!-- NEO-55: logo on the left of the full-width app bar on desktop (it
           never collapses with the side menu); on mobile no logo at all, the
           leading edge is the back arrow on detail views. -->
      <template #app-bar-start>
        <AppLogo v-if="!isMobile" :theme="theme" />
        <AppButton
          v-else-if="parentRoute"
          icon
          variant="text"
          :to="parentRoute"
          ignore-global-loading
          :title="backLabel"
          :aria-label="backLabel"
        >
          <AppIcon name="arrow-left" class="layout-back-icon" />
        </AppButton>
      </template>

      <template #nav>
        <AppNavLinks :collapsed="sidebarCollapsed" />
      </template>

      <template #drawer-footer>
        <div class="layout-drawer-footer">
          <div class="layout-nav-footer" :class="{ 'layout-nav-footer--collapsed': sidebarCollapsed }">
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
          <!-- Same label as under the login badge (useAppVersionLabel). Only
               while the menu is expanded — the collapsed rail is too narrow. -->
          <p v-if="appVersionLabel && !sidebarCollapsed" class="layout-app-version">
            {{ appVersionLabel }}
          </p>
        </div>
      </template>

      <!-- Mobile only: on desktop the title lives in the content card's own
           header row instead (see .layout-page-header below). -->
      <template #app-bar-title>
        <Transition v-if="isMobile" name="title-fade" mode="out-in">
          <div :key="moduleTitle" class="layout-appbar__title-group">
            <AppIcon v-if="moduleIcon && !parentRoute" :name="moduleIcon" class="layout-appbar__icon" />
            <span class="layout-appbar__title">{{ moduleTitle }}</span>
          </div>
        </Transition>
      </template>

      <!-- Account: top right on both breakpoints (NEO-55), avatar + name/role
           on desktop, avatar only on mobile. The menu opens below it. -->
      <template #app-bar-actions>
        <VMenu
          v-model="menuOpen"
          location="bottom end"
          offset="8"
          :close-on-content-click="false"
          min-width="220"
        >
          <template #activator="{ props: menuProps }">
            <AppButton
              v-bind="menuProps"
              variant="text"
              class="layout-user-btn"
              :class="{ 'layout-user-btn--compact': isMobile }"
              :title="t('user.user.menu')"
              :aria-label="t('user.user.menu')"
            >
              <div v-if="!isMobile" class="layout-user-info">
                <span class="layout-user-name">{{ user.displayName }}</span>
                <span class="layout-user-role">{{ user.role }}</span>
              </div>
              <VAvatar size="32" color="primary">
                <span class="text-caption font-weight-bold">{{ user.initials }}</span>
              </VAvatar>
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

      <div
        id="main-content"
        tabindex="-1"
        class="layout-main__inner"
        :class="{ 'layout-main--fading': localeTransitioning }"
      >
        <!-- Desktop page header (NEO-55): [← back on detail views] + module
             icon + title, and on the right an empty slot the current view
             teleports its own controls into (usePageHeader.ts). v-show, not
             v-if: the teleport target must never be removed from under a
             view that is still teleporting into it. -->
        <div v-show="!isMobile" class="layout-page-header">
          <AppButton
            v-if="parentRoute"
            icon
            variant="flat"
            size="large"
            :to="parentRoute"
            ignore-global-loading
            class="layout-page-header__back"
            :title="backLabel"
            :aria-label="backLabel"
          >
            <AppIcon name="arrow-left" class="layout-back-icon" />
          </AppButton>
          <Transition name="title-fade" mode="out-in">
            <div :key="moduleTitle" class="layout-appbar__title-group layout-page-header__title">
              <AppIcon v-if="moduleIcon && !parentRoute" :name="moduleIcon" class="layout-appbar__icon" />
              <span class="layout-appbar__title">{{ moduleTitle }}</span>
            </div>
          </Transition>
          <div :id="PAGE_HEADER_ACTIONS_ID" class="layout-page-header__actions" />
        </div>

        <RouterView v-slot="{ Component }">
          <!-- appear: this app-layout mount is only reached right after the
               auth screen's own exit sequence finishes (see AuthView.vue),
               so the first screen the user lands on — dashboard, etc. —
               should fade in too, not pop in instantly. Limited to the very
               first render via initialAppearDone: combining `appear` with
               `mode="out-in"` while :key keeps changing (nav clicks right
               after login) makes Vue's transition state machine drop the
               swap, so a nav click during that ~280ms window re-renders the
               same screen instead of navigating. -->
          <Transition
            name="view-fade-lift"
            mode="out-in"
            :appear="!initialAppearDone"
            @after-appear="initialAppearDone = true"
          >
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
import { navTitleKey, navIconName, navParentName } from "../router/routes";
import { providePageHeader, PAGE_HEADER_ACTIONS_ID } from "../composables/usePageHeader";
import { useI18n } from "vue-i18n";
import { AppShell, useAppVersionLabel } from "@ui";
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
import { useNotificationCenter } from "../composables/useNotificationCenter";
import { onAppReady, markAppReady } from "../composables/useAppReady";
import { usePartnerResources } from "../composables/usePartnerResources";

const route = useRoute();
const { t, locale } = useI18n();

// See the RouterView Transition below — appear is only meant to fire once,
// for the very first screen after login.
const initialAppearDone = ref(false);

const {
  theme, toggleTheme,
  sidebarCollapsed, toggleSidebar,
  isMobile,
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
const appVersionLabel = useAppVersionLabel();

// Views teleport their controls into the desktop page header only while it is shown.
providePageHeader(computed(() => !isMobile.value));

/** Detail views (patient-detail, …) point back at their list; undefined on top-level modules. */
const parentName = computed(() => {
  const name = route.name;
  return typeof name === "string" ? navParentName(name) : undefined;
});
const parentRoute = computed(() => (parentName.value ? { name: parentName.value } : undefined));

// Detail views show "← <Module>" — the parent module's title, not the record's.
const moduleTitle = computed(() => {
  const name = parentName.value ?? route.name;
  if (typeof name !== "string") return "";
  return t(navTitleKey(name));
});

const backLabel = computed(() => t("layout.backTo", { module: moduleTitle.value }));

const moduleIcon = computed(() => {
  const name = route.name;
  if (typeof name !== "string") return undefined;
  return navIconName(name) as AppIconName | undefined;
});
</script>

<style scoped>
/* Shell edge tokens (NEO-55). The chrome's outer edges are derived from the
   content they must line up with, not tuned separately:
   - the logo's left edge = the side-menu icons' left edge;
   - the avatar's right edge = the page-header action icons' right edge
     (filter, edit, …).
   AppNavLinks and .layout-main__inner consume the insets below, AppShell
   consumes the two --app-shell-bar-* results. Change an inset here and the
   logo/avatar follow. */
.layout-root {
  /* Side menu: list padding + nav item padding → icon box left edge. */
  --layout-nav-inset: 8px;
  --layout-nav-item-inset: 10px;
  /* Content card padding, and the icon's inset inside a size="large" (56px)
     icon button holding a 24px icon: (56 − 24) / 2. */
  --layout-card-inset: 16px;
  --layout-action-icon-inset: 16px;
  /* AppIcon glyphs are stroked ~1px inside their box; the logo and the
     avatar circle have no such inset, so they sit 1px further in to match
     the icons' visible ink rather than their boxes. */
  --layout-icon-ink-inset: 1px;
  /* Account button's own end padding (its hover pill), subtracted so the
     avatar circle itself — not the pill — lands on the edge. */
  --layout-user-btn-pad-end: 6px;

  --app-shell-bar-end-inset: calc(
    var(--layout-card-inset) + var(--layout-action-icon-inset) + var(--layout-icon-ink-inset)
      - var(--layout-user-btn-pad-end)
  );
}

.layout-root--desktop {
  --app-shell-bar-start-inset: calc(
    var(--layout-nav-inset) + var(--layout-nav-item-inset) + var(--layout-icon-ink-inset)
  );
}

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

/* Only the collapse chevron lives here now (the account moved to the app
   bar, NEO-55): right-aligned under the expanded menu, centered in the rail. */
.layout-nav-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.layout-nav-footer--collapsed {
  justify-content: center;
}

:deep(.app-shell__nav-footer:has(.layout-nav-footer--collapsed)) {
  padding-inline: 4px;
}

.layout-collapse-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  margin-inline-end: 8px;
}

.layout-nav-footer--collapsed .layout-collapse-btn {
  margin-inline-end: 0;
}

/* Account button, top right of the app bar (NEO-55). Static sizing only — no
   hover/focus size change (two earlier animated attempts both read as broken);
   feedback comes from Vuetify's own text-button overlay. */
.layout-user-btn {
  height: auto !important;
  min-height: 44px;
  text-transform: none;
  letter-spacing: normal;
  border-radius: 999px;
}

/* theme.scss gives every non-icon button `padding-inline: 24px !important`
   (pill CTA look) via `.v-btn:not(.v-btn--icon):not(…):not(…)`. Left alone,
   that 24px — not the shell's end token — decides where the avatar lands,
   18px short of the header icons; hence !important and a selector scoped
   through .layout-root that outranks it. */
.layout-root .layout-user-btn.v-btn:not(.v-btn--icon) {
  padding-block: 4px;
  padding-inline: 12px var(--layout-user-btn-pad-end) !important;
}

.layout-root .layout-user-btn--compact.v-btn:not(.v-btn--icon) {
  min-width: 0;
  padding-inline: var(--layout-user-btn-pad-end) !important;
}

.layout-user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 0;
  margin-inline-end: 10px;
}

/* Desktop page header: first row of the content card. min-height matches the
   list toolbar's search field, so the row doesn't jump between a list (toolbar
   teleported in) and a view with nothing on the right. Child-combinator
   selector so it outranks `.layout-main__inner > *` below (which makes every
   other child a growing column). */
.layout-main__inner > .layout-page-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  min-height: 48px;
  margin-bottom: 16px;
  flex: 0 0 auto;
}

.layout-page-header__title {
  flex: 0 0 auto;
  padding-inline-start: 4px;
}

.layout-page-header__actions {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

/* Pulled toward the card edge and the title, so "← Patients" reads as one label. */
.layout-page-header__back {
  background: transparent;
  margin-inline-start: -8px;
}

.layout-page-header__back + .layout-page-header__title {
  padding-inline-start: 0;
}

.layout-back-icon {
  width: 24px;
  height: 24px;
}

.layout-user-name {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  max-width: 200px;
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
  padding: var(--layout-card-inset);
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
/* Account row with the app version under it, on the grey drawer. */
.layout-drawer-footer {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
  padding-bottom: 4px;
}

/* Quiet footnote, not UI: small and low-contrast, left-aligned with the
   account button's avatar above it. */
.layout-app-version {
  margin: 0;
  padding-inline: 12px 0;
  font-size: 11px;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), 0.45);
  /* Wraps rather than truncating if a long build number ever outgrows the
     ~200px drawer — the number is the point of the line. */
  overflow-wrap: anywhere;
}
</style>
