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
    <!-- NEO-87: "Add NeoSleep to this device" — opens once after login, and from the avatar menu. -->
    <AppInstallCard />
    <!-- Loaded on first open: keeps the dialog (and its form fields) out of the shell bundle. -->
    <ReportProblemDialog v-if="reportDialogMounted" />

    <AppShell
      :rail-collapsed="sidebarCollapsed"
      :rail-width="64"
      :nav-items="visibleNavItems"
      :menu-label="t('layout.nav.modules')"
      :more-label="t('layout.nav.more')"
      :close-label="t('layout.nav.close')"
      bottom-nav-show-labels
      sheet
    >
      <!-- NEO-55: logo on the left of the full-width app bar (it never
           collapses with the side menu). NEO-108: on phones too, smaller;
           when the bar's icons leave it too little room it folds into its
           O (useBarLogoFit). "← <Module>" lives in the content card. -->
      <template #app-bar-start>
        <div class="layout-appbar__brand">
          <AppLogo
            ref="barLogo"
            :theme="theme"
            :height="isMobile ? MOBILE_LOGO_HEIGHT : DESKTOP_LOGO_HEIGHT"
            :folded="logoFolded"
            :mark-size="AVATAR_SIZE"
          />
          <!-- NEO-102: which environment this is, only on non-prod builds.
               CORE-178: with the version too ("DEV 1.1.0.142"). -->
          <span
            v-if="appVersion.badge"
            ref="envBadge"
            class="layout-env-badge"
            data-testid="env-badge"
          >{{ appVersion.badge }}</span>
        </div>
      </template>

      <template #nav>
        <AppNavLinks :collapsed="sidebarCollapsed" />
      </template>

      <template #drawer-footer>
        <div class="layout-drawer-footer">
          <div
            v-if="SIDEBAR_COLLAPSE_ENABLED"
            class="layout-nav-footer"
            :class="{ 'layout-nav-footer--collapsed': sidebarCollapsed }">
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
        </div>
      </template>

      <!-- Account: top right on both breakpoints (NEO-55), avatar + name/role
           on desktop, avatar only on mobile. The menu opens as a card around
           that avatar on both (NEO-154 replaced the phone bottom sheet). -->
      <template #app-bar-actions>
        <div ref="barActions" class="layout-bar-actions">
          <!-- CORE-4: the notification bell, for every logged-in role, on
               both breakpoints — directly left of the account button. Its
               own polling lifecycle is owned by this layout (useNotificationCenter
               below), not by this component, which only renders the UI. -->
          <AppNotificationCenter />
          <!-- NEO-122 / NEO-154 / NEO-161: the avatar button turns into the
               menu — the avatar stays put and grows, the glass card springs
               out of it (same on desktop and phone); see AppAccountMenu. -->
          <AppAccountMenu v-model:open="menuOpen" :mobile="isMobile" :label="t('user.user.menu')">
          <template #trigger="{ open: accountMenuOpen }">
            <AppAccountButton
              :name="user.displayName"
              :role-label="user.role"
              :role="user.roleKey"
              :compact="isMobile"
              :label="t('user.user.menu')"
              :expanded="accountMenuOpen"
              :avatar-size="AVATAR_SIZE"
            />
          </template>

          <AppUserMenuPanel
            :name="user.displayName"
            :email="user.email"
            :role-label="user.role"
            :role="user.roleKey"
            :initials="user.initials"
            :avatar-size="MENU_AVATAR_SIZE"
            :region="user.region"
            :theme-preference="themePreference"
            :locale="(locale as string)"
            :can-change-password="user.canChangePassword"
            :version="appVersion.version"
            :channel="appVersion.channel"
            :has-reports="hasReports"
            @set-theme="setThemePreference"
            @change-locale="(lang) => setLocale(lang as 'en' | 'pl' | 'mx')"
            @change-password="router.push({ name: 'change-password', query: { from: CHANGE_PASSWORD_FROM_MENU } })"
            @report-problem="openReportProblem({ where: String(route.name ?? '') })"
            @my-reports="router.push({ name: 'my-reports' })"
            @logout="onLogout"
            @close="menuOpen = false"
          />
          </AppAccountMenu>
        </div>
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
        <!-- NEO-56: hidden while a detail view shows its record header, whose
             "MODULE ›" eyebrow above the record's name replaces this row —
             on phones too since NEO-152 (NEO-108 had kept "← Module" there). -->
        <!-- NEO-113/152: a view's open icon search covers the whole row; the title fades under it. -->
        <div
          v-show="pageHeaderVisible"
          class="layout-page-header"
          :class="{ 'layout-page-header--search': pageHeaderRow.searchTakesRow.value, 'layout-page-header--child': !!parentRoute }"
        >
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
          <!-- NEO-152: no title animation of its own — the title changes with
               the page (the sheet's view transition carries it). Desktop
               lists add a quiet count line 4 px under the title, like the
               identity line under a record's name; phones leave it out. -->
          <div class="layout-appbar__title-group layout-page-header__title">
            <AppIcon
              v-if="moduleIcon && !parentRoute"
              :ref="(el) => (headerTitleGlyph.el.value = el)"
              :name="moduleIcon"
              class="layout-appbar__icon"
              :style="{ marginInlineStart: `${-headerTitleGlyph.inset.value}px` }"
            />
            <div class="layout-page-header__titles">
              <span
                :ref="setHeaderTitleEl"
                class="layout-appbar__title"
                :title="moduleTitle"
              >{{ moduleTitle }}</span>
              <span
                v-if="!isMobile && !parentRoute && pageHeaderRow.subtitle.value !== null"
                class="layout-page-header__subtitle"
                data-testid="page-header-subtitle"
              >
                <span v-if="pageHeaderRow.subtitle.value">{{ pageHeaderRow.subtitle.value }}</span>
                <span v-else class="layout-page-header__subtitle-skeleton" aria-hidden="true" />
              </span>
            </div>
          </div>
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
               same screen instead of navigating.
               NEO-85: where the browser has View Transitions, page changes
               are animated by router/pageTransitions.ts instead and the view
               is rendered without this wrapper (a plain swap the browser can
               snapshot; the shell's own entrance covers the first screen).
               A CSS-less <Transition> here broke the swap: Vue threw on
               unmount and the list never re-rendered after Back. -->
          <component v-if="useViewTransitions" :is="Component" :key="route.path" />
          <Transition
            v-else
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
import { ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent, type ComponentPublicInstance } from "vue";
import { useRoute, useRouter } from "vue-router";
import { navTitleKey, navIconName, navParentName } from "../router/routes";
import { pageTransitionsSupported } from "../router/pageTransitions";
import {
  providePageHeader,
  providePageHeaderRow,
  provideRecordHeaderClaim,
  isPageHeaderVisible,
  PAGE_HEADER_ACTIONS_ID,
} from "../composables/usePageHeader";
import { useGlyphInset } from "../composables/useGlyphInset";
import { useBarLogoFit } from "../composables/useBarLogoFit";
import { useThemeColorMeta } from "../composables/useThemeColorMeta";
import { MENU_AVATAR_SIZE } from "../composables/useGlassPopoverMotion";
import { useI18n } from "vue-i18n";
import { AppShell, useAppVersionParts, CHANGE_PASSWORD_FROM_MENU } from "@ui";
import { useLayoutState } from "../composables/useLayoutState";
import { useVisibleNavRoutes } from "../composables/useVisibleNavRoutes";
import {
  AppLogo,
  AppNavLinks,
  AppUserMenuPanel,
  AppAccountMenu,
  AppOfflineBar,
  AppInstallCard,
  AppAccountButton,
} from "./components";
import AppButton from "../components/AppButton.vue";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppNotificationCenter from "../components/AppNotificationCenter.vue";
import { loadHasReports, openReportProblem, useReportProblem } from "../composables/useReportProblem";

import { useNotificationCenter } from "../composables/useNotificationCenter";
import { useLabOrderStatusSync } from "../composables/useLabOrderStatusSync";
import { onAppReady, markAppReady } from "../composables/useAppReady";
import { usePartnerResources } from "../composables/usePartnerResources";
import { SIDEBAR_COLLAPSE_ENABLED } from "../config/layout";

const ReportProblemDialog = defineAsyncComponent(() => import("../components/ReportProblemDialog.vue"));
const { state: reportProblemState, hasReports } = useReportProblem();
// Stays mounted after the first open so closing keeps its animation.
const reportDialogMounted = ref(reportProblemState.open);
watch(
  () => reportProblemState.open,
  (open) => {
    if (open) reportDialogMounted.value = true;
  },
);

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

// See the RouterView Transition below — appear is only meant to fire once,
// for the very first screen after login.
const initialAppearDone = ref(false);
/** Fixed for the session: switching wrappers later would remount the current view. */
const useViewTransitions = pageTransitionsSupported();

const {
  theme, themePreference, setThemePreference,
  sidebarCollapsed, toggleSidebar,
  isMobile,
  user,
  localeTransitioning, setLocale,
  onLogout,
  focusMainContent,
} = useLayoutState();

// NEO-131: the installed app's title bar (and the phone status bar) takes the
// desk color the app bar and side menu are painted with, instead of the
// manifest's teal, so the top of the window reads as one surface.
useThemeColorMeta(() => "var(--pwa-desk)");

const { visibleNavItems } = useVisibleNavRoutes();

// AppLayout is mounted for the whole authenticated session, so it — not
// AppNotificationCenter.vue, which now only renders on DashboardView — owns
// the unread-count polling lifecycle. That's what keeps the nav badge dots
// (sidebar + bottom nav) live while the rep is on any other screen.
const { unreadCount, startPolling, stopPolling } = useNotificationCenter();
onMounted(startPolling);
onUnmounted(stopPolling);

// CORE-67: device order statuses refresh from the lab every 15 min while the
// app is open; a scheduled job covers the rest of the day (4 runs).
useLabOrderStatusSync();

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
// "My reports" in the account menu shows only once the user has sent one (CORE-158).
onAppReady(() => void loadHasReports());
onMounted(markAppReady);

const menuOpen = ref(false);
const appVersion = useAppVersionParts();

// Views teleport their controls into the desktop page header only while it is shown.
// NEO-113: on phones too — the header row is the card's first line (NEO-108),
// and a list's search / filter / + sit on it next to the module title.
providePageHeader(computed(() => true));
const pageHeaderRow = providePageHeaderRow();
function setHeaderTitleEl(el: Element | ComponentPublicInstance | null) {
  pageHeaderRow.title.value = el instanceof HTMLElement ? el : null;
}
const recordHeaderClaim = provideRecordHeaderClaim();
// Hidden while a record header replaces it — NEO-152: on phones too, whose
// record header is now the desktop one, its "MODULE ›" link above the name
// being the way back (no separate "← Module" row).
const pageHeaderVisible = computed(() =>
  isPageHeaderVisible({ recordHeaderClaimed: recordHeaderClaim.value, isMobile: isMobile.value, routeMeta: route.meta }),
);

// NEO-108: logo sizes. The folded O is exactly the avatar's size, so both
// corners of the phone bar match.
const DESKTOP_LOGO_HEIGHT = 28;
const MOBILE_LOGO_HEIGHT = 18;
const AVATAR_SIZE = 32;
/** Unfolded wordmark width at its current height (viewBox 536 × 90). */
const wordmarkWidth = computed(() => ((isMobile.value ? MOBILE_LOGO_HEIGHT : DESKTOP_LOGO_HEIGHT) * 536) / 90);
const barLogo = ref<ComponentPublicInstance | null>(null);
const barActions = ref<HTMLElement | null>(null);
const envBadge = ref<HTMLElement | null>(null);
/** .layout-appbar__brand's gap between the logo and the env badge. */
const BRAND_GAP = 10;
const { folded: logoFolded } = useBarLogoFit(barLogo, barActions, wordmarkWidth, isMobile, { el: envBadge, gap: BRAND_GAP });

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

// The title's module icon is pulled back by its own glyph margin so the
// visible drawing — not the icon box — sits on the content edge.
const headerTitleGlyph = useGlyphInset(pageHeaderVisible);

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
  /* Nav icon slot (VListItem prepend) + its gap to the label → where the
     menu labels start; the version footnote lines up with that edge. */
  --layout-nav-icon-size: 20px;
  --layout-nav-icon-gap: 10px;
  --layout-nav-label-inset: calc(
    var(--layout-nav-inset) + var(--layout-nav-item-inset) + var(--layout-nav-icon-size)
      + var(--layout-nav-icon-gap)
  );
  /* Content card padding = the responsive page gutter (NEO-61, 20/24/32px,
     packages/brand/spacing.css), and the icon's inset inside a size="large"
     (56px) icon button holding a 24px icon: (56 − 24) / 2. */
  --layout-card-inset: var(--page-gutter, 16px);
  --layout-action-icon-inset: 16px;
  /* AppIcon glyphs are stroked ~1px inside their box; the logo and the
     avatar circle have no such inset, so they sit 1px further in to match
     the icons' visible ink rather than their boxes. */
  --layout-icon-ink-inset: 1px;
  /* The arrow-left glyph starts 4px into its 24px box (its own shape, not
     the set-wide 1px above). */
  --layout-back-arrow-ink-inset: 4px;
  /* Account button's own end padding (its hover pill), subtracted so the
     avatar circle itself — not the pill — lands on the edge. */
  --layout-user-btn-pad-end: 6px;

  --app-shell-bar-end-inset: calc(
    var(--layout-card-inset) + var(--layout-action-icon-inset) + var(--layout-icon-ink-inset)
      - var(--layout-user-btn-pad-end) + var(--app-shell-sheet-gap)
  );

  /* NEO-85 "record stack": the chrome and everything behind the content
     sheet is the desk (theme.scss --pwa-desk); the sheet sits
     --app-shell-sheet-gap off the right edge and leaves --layout-sheet-foot
     of desk below itself. */
  --app-shell-chrome: var(--pwa-desk);
  --app-shell-sheet-gap: 0px;
  --layout-sheet-foot: 12px;
  background: var(--pwa-desk);
}

.layout-root--desktop {
  --app-shell-sheet-gap: 12px;
  --app-shell-bar-start-inset: calc(
    var(--layout-nav-inset) + var(--layout-nav-item-inset) + var(--layout-icon-ink-inset)
  );
}

/* Mobile (NEO-108): no side menu, and the title lives in the card, so the
   bar's two outer elements sit on the content sheet's own outer edges — the
   logo on its left edge, the avatar circle on its right edge (the account
   button's end padding subtracted). */
.layout-root:not(.layout-root--desktop) {
  --layout-sheet-margin: 8px;
  --app-shell-bar-start-inset: var(--layout-sheet-margin);
  --app-shell-bar-end-inset: calc(var(--layout-sheet-margin) - var(--layout-user-btn-pad-end));
  /* NEO-115 (4 px grid): list rows run 16 px in from the sheet's edge and
     keep a 12 px inset of their own; everything else (title, back link,
     record header, fields) starts on that same inner line, 16 + 12 = 28. */
  --layout-sheet-pad: 16px;
  --layout-row-inset: 12px;
  --layout-card-inset: calc(var(--layout-sheet-pad) + var(--layout-row-inset));
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

/* NEO-152: the title over its count line, 4 px apart — the same rhythm as a
   record's name over its identity line (ItemDetailLayout). */
.layout-page-header__titles {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  min-width: 0;
}
.layout-page-header__subtitle {
  display: flex;
  align-items: center;
  height: 18px;
  font-size: 0.8125rem;
  line-height: 18px;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-variant-numeric: tabular-nums;
}
/* While the list's first page loads: a placeholder of the same height. */
.layout-page-header__subtitle-skeleton {
  display: block;
  width: 88px;
  height: 10px;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.07);
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

/* NEO-152: a list's name is the page's heading — 28 px bold on desktop
   (phones: 24 px, below), clearly above the 14 px table text. */
.layout-appbar__title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 32px;
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

/* Account button (AppAccountButton, NEO-55): its own look lives in that
   component; only its fit against the shell is set here.
   theme.scss gives every non-icon button `padding-inline: 24px !important`
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

/* Account slot wrapper: useBarLogoFit measures where the bar's icons start.
   CORE-4: the gap also separates the notification bell from the account
   button, on the 4 px grid. */
.layout-bar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

/* Page header: first row of the content card (desktop; phones too since NEO-108). min-height matches the
   list toolbar's search field, so the row doesn't jump between a list (toolbar
   teleported in) and a view with nothing on the right. Child-combinator
   selector so it outranks `.layout-main__inner > *` below (which makes every
   other child a growing column). */
.layout-main__inner > .layout-page-header {
  /* NEO-152: the containing block of a list's open icon search, which
     covers this whole row (AppEntityList's overlay). */
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-1, 4px);
  min-height: 48px;
  margin-bottom: var(--space-6, 24px);
  flex: 0 0 auto;
}

/* Phone: the row is the card's first line — 16 px from the sheet's top edge
   (card padding minus the row inset), 48 px tall (touch size), 8 px above
   the content (NEO-115). */
.layout-root:not(.layout-root--desktop) .layout-main__inner > .layout-page-header {
  min-height: 48px;
  margin-top: calc(-1 * var(--layout-row-inset));
  margin-bottom: var(--space-2, 8px);
}

/* NEO-115 title steps on phones: 1 — a main page title, 24 px bold. */
.layout-root:not(.layout-root--desktop) .layout-page-header__title .layout-appbar__title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 32px;
}
.layout-root:not(.layout-root--desktop) .layout-page-header__title .layout-appbar__icon {
  width: 24px;
  height: 24px;
}
/* 2 — on an item page "← Module" is the way back, not a heading: a small
   grey link (the record name below is the heading, ItemDetailLayout). */
.layout-root:not(.layout-root--desktop) .layout-main__inner > .layout-page-header--child {
  min-height: 32px;
  gap: 0;
}
.layout-root:not(.layout-root--desktop) .layout-page-header--child .layout-appbar__title {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
/* 32 px button around an 18 px arrow; pulled back by its own inset plus the
   arrow's ink margin (4/24 of its size) so the arrow starts on the line. */
.layout-root:not(.layout-root--desktop) .layout-page-header--child .layout-page-header__back {
  width: 32px;
  height: 32px;
  min-width: 32px;
  margin-inline-start: -10px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.layout-root:not(.layout-root--desktop) .layout-page-header--child .layout-back-icon {
  width: 18px;
  height: 18px;
}

/* No inline padding: the module icon's glyph (pulled back by its own
   measured margin, useGlyphInset) starts exactly at the card inset, the same
   edge as the table/cards below. */
.layout-page-header__title {
  flex: 0 0 auto;
}

.layout-page-header__actions {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

/* NEO-113, phones: the title shares the row with the list's icons and gives
   way first — one line, cut with "…" only once the list has already folded
   Filter / + into "⋯" (AppEntityList) and it still does not fit. */
.layout-root:not(.layout-root--desktop) .layout-page-header__title {
  flex: 1 1 auto;
  min-width: 0;
}
.layout-root:not(.layout-root--desktop) .layout-page-header__title .layout-appbar__title {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.layout-root:not(.layout-root--desktop) .layout-page-header__actions {
  flex: 0 0 auto;
}
/* Open search (or a kept query) takes the whole row, title included. */
/* NEO-152: an open icon search covers the row; the title and the back button
   only fade under it — they keep their space, so nothing in the row moves
   (NEO-113 had taken them out of the layout, which made the row jump). */
.layout-page-header__title,
.layout-page-header__back {
  transition: opacity 150ms ease;
}
.layout-page-header--search .layout-page-header__title,
.layout-page-header--search .layout-page-header__back {
  opacity: 0;
  pointer-events: none;
}

/* Pulled back by the icon's inset in the 56px button plus the arrow glyph's
   own margin, so the visible arrow starts at the card inset like the content. */
.layout-page-header__back {
  background: transparent;
  margin-inline-start: calc(-1 * (var(--layout-action-icon-inset) + var(--layout-back-arrow-ink-inset)));
}

.layout-back-icon {
  width: 24px;
  height: 24px;
}

.layout-main--fading {
  opacity: 0;
  transition: opacity 180ms ease;
}

/* The content sheet. Page scroll stays on the window, so the sheet's top edge
   scrolls away under the fixed app bar like paper under a ruler; on desktop
   AppShell's fixed corner masks keep its top corners round. Its min-height
   fills the viewport, so on a short page its bottom edge sits just above the
   screen's; on a long one it appears at the end of the scroll. */
.layout-main__inner {
  padding: var(--layout-card-inset);
  min-height: calc(100dvh - var(--v-layout-top, 64px) - var(--v-layout-bottom, 0px) - var(--layout-sheet-foot));
  margin: 0 var(--app-shell-sheet-gap) var(--layout-sheet-foot) 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--pwa-sheet);
  border-radius: var(--pwa-sheet-radius);
  box-shadow: var(--pwa-sheet-shadow);
  /* The one element page changes animate (router/pageTransitions.ts). */
  view-transition-name: pwa-page;
}
/* Phone: the sheet is inset on both sides; the bottom nav already reserves
   its own space (AppShell .app-shell__main--bottom-nav-space). */
.layout-root:not(.layout-root--desktop) .layout-main__inner {
  margin-inline: var(--layout-sheet-margin);
  min-height: calc(
    100dvh - var(--v-layout-top, 56px) - var(--mobile-bottom-nav-height, 56px) - 2 * var(--mobile-bottom-nav-float, 10px)
      - env(safe-area-inset-bottom)
      - var(--layout-sheet-foot)
  );
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
/* Only the collapse toggle — the version moved to the account menu (NEO-102). */
.layout-drawer-footer {
  width: 100%;
  min-width: 0;
}

.layout-appbar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* NEO-102: non-prod builds only ("DEV 1.1.0.142"), so a tester always knows
   which environment they are in without opening anything. */
.layout-env-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.06em;
  padding: 4px 6px;
  border-radius: 4px;
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.14);
}
</style>
