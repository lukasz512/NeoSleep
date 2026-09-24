<template>
  <!-- VAppBar registers with Vuetify's layout system before VNavigationDrawer
       so it claims the full top-of-viewport width; the drawer then registers
       below it, on the left, rather than the app-bar being squeezed to the
       right of a full-height drawer. -->
  <VAppBar
    flat
    color="surface-container-low"
    :border="false"
    :height="mobile ? 56 : 64"
    class="app-shell__bar"
    :class="enterClass"
    :style="{ '--app-shell-enter-order': 0 }"
  >
    <!-- NEO-55: no hamburger — on mobile every module is reachable from the
         bottom bar (+ its "More" sheet), so the bar's leading edge is left to
         the app: the logo on desktop, a back arrow on mobile detail views. -->
    <template #prepend>
      <div class="app-shell__bar-start">
        <slot name="app-bar-start" :mobile="mobile" />
      </div>
    </template>

    <VAppBarTitle class="app-shell__title">
      <slot name="app-bar-title" :mobile="mobile" />
    </VAppBarTitle>

    <template #append>
      <slot name="app-bar-actions" :mobile="mobile" />
    </template>
  </VAppBar>

  <!-- Desktop only: the permanent, rail-collapsible side menu. Mobile has no
       drawer at all any more — its navigation is the bottom bar. -->
  <VNavigationDrawer
    v-if="!mobile"
    :model-value="true"
    permanent
    :rail="railCollapsed"
    :width="width"
    :rail-width="railWidth"
    :aria-label="menuLabel"
    color="surface-container-low"
    class="app-shell__nav"
    :class="enterClass"
    :style="{ '--app-shell-enter-order': 1 }"
  >
    <slot name="nav" />

    <template #append>
      <div class="app-shell__nav-footer">
        <slot name="drawer-footer" />
      </div>
    </template>
  </VNavigationDrawer>

  <VMain
    class="app-shell__main"
    :class="{
      'app-shell__main--inset': !mobile,
      'app-shell__main--bottom-nav-space': mobile && showBottomNav,
      ...enterClass,
    }"
    :style="{ '--app-shell-enter-order': 2 }"
  >
    <slot />
  </VMain>

  <MobileBottomNavBar
    v-if="mobile && showBottomNav"
    :aria-label="menuLabel"
    class="app-shell__bottom-nav"
    :class="enterClass"
    :style="{ '--app-shell-enter-order': 3 }"
  >
    <MobileBottomNavItem
      v-for="item in primaryNavItems"
      :key="item.path"
      :to="item.path"
      :label="item.label"
      :show-label="bottomNavShowLabels"
    >
      <slot name="nav-icon" :item="item" />
    </MobileBottomNavItem>
    <MobileBottomNavItem
      v-if="overflowNavItems.length"
      :label="moreLabel"
      :show-label="bottomNavShowLabels"
      :active="moreOpen || overflowActive"
      :expanded="moreOpen"
      class="app-shell__more"
      @click="moreOpen = !moreOpen"
    >
      <slot name="more-icon">
        <span class="app-shell__more-dots"><span /><span /><span /></span>
      </slot>
    </MobileBottomNavItem>
  </MobileBottomNavBar>

  <!-- "More": the modules that don't fit the bottom bar (NEO-55). Modules
       only — the account menu stays under the avatar in the app bar. Its
       content is padded by the bottom bar's height, so the sheet rises from
       behind the (higher z-index) bar and the bar stays tappable. -->
  <VBottomSheet
    v-if="mobile && showBottomNav && overflowNavItems.length"
    v-model="moreOpen"
    class="app-shell__more-sheet"
  >
    <VCard color="surface-container-low" class="app-shell__more-card">
      <p class="app-shell__more-title">{{ moreTitle }}</p>
      <VList nav bg-color="transparent" :aria-label="moreTitle">
        <VListItem
          v-for="item in overflowNavItems"
          :key="item.path"
          :to="item.path"
          :title="item.label"
          rounded="lg"
          class="app-shell__more-item"
          @click="moreOpen = false"
        >
          <template #prepend>
            <span class="app-shell__more-item-icon" aria-hidden="true">
              <slot name="nav-icon" :item="item" />
            </span>
          </template>
        </VListItem>
      </VList>
    </VCard>
  </VBottomSheet>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from "vue";
import { useDisplay } from "vuetify";
import { useRoute } from "vue-router";
import MobileBottomNavBar from "./MobileBottomNavBar.vue";
import MobileBottomNavItem from "./MobileBottomNavItem.vue";

export interface AppShellNavItem {
  path: string;
  label: string;
  /** Opaque identifier apps can use to resolve an icon in the #nav-icon slot — AppShell doesn't interpret it. */
  name?: string;
}

const BOTTOM_NAV_ITEM_COUNT = 4;

/**
 * Shared responsive app shell (packages/ui) — the structural chrome only:
 * a full-width VAppBar, a permanent rail-collapsible VNavigationDrawer on
 * desktop, and on mobile (`useDisplay().mobile`) no drawer at all but a
 * bottom nav bar (the shared MobileBottomNavBar/MobileBottomNavItem, same
 * feel as apps/web's) with the first 4 nav items plus a "More" tab that
 * opens a bottom sheet with the rest (NEO-55 — one visible navigation, no
 * hamburger), and a VMain for routed content.
 *
 * Deliberately has no knowledge of roles, auth, theming, or branding — those
 * are app-specific concerns supplied via slots (app-bar-start, app-bar-title,
 * app-bar-actions, nav, drawer-footer) so apps/pwa can plug in its own content. Only apps/pwa
 * consumes AppShell today — apps/web has its own DefaultHeader, built on the
 * separately-exported MobileNavDrawer instead, since apps/web doesn't use
 * Vuetify anywhere else.
 */
const props = withDefaults(
  defineProps<{
    /** Desktop rail (icon-only collapsed) mode. Ignored on mobile. */
    railCollapsed?: boolean;
    /** Nav items — the mobile bottom bar shows the first 4, the rest go under "More". */
    navItems?: AppShellNavItem[];
    showBottomNav?: boolean;
    /** Show text labels under the bottom-nav icons (apps/web keeps them icon-only). */
    bottomNavShowLabels?: boolean;
    menuLabel?: string;
    /** Label of the bottom bar's "More" tab. */
    moreLabel?: string;
    /** Heading of the "More" sheet. */
    moreTitle?: string;
    width?: number;
    railWidth?: number;
  }>(),
  {
    railCollapsed: false,
    navItems: () => [],
    showBottomNav: true,
    bottomNavShowLabels: false,
    menuLabel: "Menu",
    moreLabel: "More",
    moreTitle: "More",
    width: 220,
    railWidth: 56,
  },
);

const { mobile } = useDisplay();
const route = useRoute();

const primaryNavItems = computed(() => props.navItems.slice(0, BOTTOM_NAV_ITEM_COUNT));
const overflowNavItems = computed(() => props.navItems.slice(BOTTOM_NAV_ITEM_COUNT));

const moreOpen = ref(false);

/** "More" reads as the active tab while the rep is inside one of its modules (list or detail). */
const overflowActive = computed(() =>
  overflowNavItems.value.some((item) => route.path === item.path || route.path.startsWith(`${item.path}/`)),
);

// Any navigation (a sheet item, the back arrow, a bottom-bar tab) closes the sheet.
watch(() => route.fullPath, () => (moreOpen.value = false));
watch(mobile, (isMobile) => {
  if (!isMobile) moreOpen.value = false;
});

// One-time entrance, played whenever this shell first mounts (i.e. right
// after the auth screen's own exit sequence, see AuthView.vue): the parts
// appear one after another, top to bottom — app bar, drawer, main content,
// mobile bottom nav — each out of nothing, rising slightly from below. The
// order/stagger itself lives in CSS (--app-shell-enter-order in the template,
// see .app-shell__enter), so this only flips one flag.
// Once it has played, the entrance classes are dropped entirely, so their
// transition shorthand stops overriding Vuetify's own drawer/app-bar
// transitions (rail collapse, mobile drawer slide) for the rest of the session.
type EnterPhase = "hidden" | "entering" | "done";
const enterPhase = ref<EnterPhase>("hidden");
const enterClass = computed(() => ({
  "app-shell__enter": enterPhase.value !== "done",
  "app-shell__enter--visible": enterPhase.value === "entering",
}));
// Last part's delay (order 3 x 110ms) + its 750ms translate, plus a margin.
const ENTER_TOTAL_DURATION = 1150;

onMounted(() => {
  // Two frames, so the hidden starting state is painted first — flipping the
  // flag in the same frame the DOM was inserted would skip the transition.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      enterPhase.value = "entering";
      window.setTimeout(() => (enterPhase.value = "done"), ENTER_TOTAL_DURATION);
    }),
  );
});
</script>

<style scoped>
/* Entrance only (see `entered` in <script>) — staggered top to bottom by
   --app-shell-enter-order, each part fading up from 14px below. Fast at the
   start, a long smooth settle at the end (expo-out). Uses the standalone
   `translate` property, not `transform`, so it composes with the transforms
   Vuetify itself writes on the app bar/drawer instead of fighting them. */
.app-shell__enter {
  --app-shell-enter-delay: calc(var(--app-shell-enter-order, 0) * 110ms);
  opacity: 0;
  translate: 0 14px;
  transition:
    opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) var(--app-shell-enter-delay),
    translate 0.75s cubic-bezier(0.16, 1, 0.3, 1) var(--app-shell-enter-delay);
}

.app-shell__enter--visible {
  opacity: 1;
  translate: 0 0;
}

@media (prefers-reduced-motion: reduce) {
  .app-shell__enter {
    translate: none;
    transition: none;
  }
}

/* Bar + drawer read as one continuous chrome frame (same surface-container-low
   fill, no dividing lines) with the routed content set into it as an inset
   card, instead of two hard-bordered strips. Vuetify gives a left drawer a thin
   border-right by default; the bar's own border is off via its :border prop. */
.app-shell__nav {
  border: none;
}

/* The card's rounded top-left corner. Page scroll is on the window (views such
   as ResourcesView read window.scrollY), so rounding the content itself would
   scroll the corner away under the fixed bar. Instead a fixed, chrome-colored
   mask sits exactly where the bar meets the drawer and carves the corner out of
   whatever scrolls beneath it. --v-layout-top/left are Vuetify's own layout
   offsets (bar height, drawer or rail width), so it follows rail collapse. */
.app-shell__main--inset::before {
  --app-shell-card-radius: 16px;
  content: "";
  position: fixed;
  top: var(--v-layout-top);
  left: var(--v-layout-left);
  width: var(--app-shell-card-radius);
  height: var(--app-shell-card-radius);
  z-index: 1003;
  pointer-events: none;
  background: radial-gradient(
    circle at 100% 100%,
    transparent calc(var(--app-shell-card-radius) - 0.5px),
    rgb(var(--v-theme-surface-container-low)) var(--app-shell-card-radius)
  );
  /* Same timing as Vuetify's own .v-main padding transition, so the corner
     tracks the drawer edge during rail collapse/expand. */
  transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* No divider/border above this footer — removed per explicit feedback ("ta linia
   nad userem ma znikac"). Round 2 had gone the opposite way (adding an explicit
   border-top because the default VDivider read as invisible) on a misreading of
   the original ask; this corrects that. */
.app-shell__nav-footer {
  display: flex;
  justify-content: center;
  padding: 12px;
}

/* --appbar-row: the one shared height every app-bar leading element (the
   back arrow, the title's icon+text, the logo) is built to. Previously each
   element had its own hand-tuned padding/margin to fake a shared baseline
   under `align-items: flex-end` — fragile, and it broke again on every
   unrelated tweak. Now every element's own box is this height, so plain
   `align-items: center` puts all of their centers on one line by
   construction, not by pixel-guessing. Matches Vuetify's own
   `.v-toolbar-title` defaults (font-size 1.25rem / line-height 1.75rem),
   so the title no longer needs to fight the framework either. */
.app-shell__bar {
  --appbar-row: 28px;
}

.app-shell__bar :deep(.v-toolbar__content),
.app-shell__bar :deep(.v-toolbar__prepend),
.app-shell__bar :deep(.v-toolbar__append) {
  align-items: center;
}

/* Vuetify's own 20px inline-start margin on the title assumes a bare text
   label right after the edge. Our title carries its own icon, and on mobile
   detail views follows the back arrow, so a smaller gap reads as one group. */
.app-shell__bar :deep(.v-toolbar__content > .v-toolbar-title) {
  margin-inline-start: 8px;
}

.app-shell__bar-start {
  display: flex;
  align-items: center;
  min-height: var(--appbar-row);
  padding-inline-start: 8px;
}

/* Back arrow + title read as one "← Patients" label on mobile. */
.app-shell__bar :deep(.v-toolbar__prepend:has(.app-shell__bar-start:not(:empty)) + .v-toolbar-title) {
  margin-inline-start: 0;
}

.app-shell__bar-start:empty {
  display: none;
}

/* The "More" tab's icon: three dots, drawn at the nav icons' 20px box. */
.app-shell__more-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 20px;
  height: 20px;

  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }
}

.app-shell__more-card {
  padding: 16px 12px calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom) + 8px);
  border-radius: 16px 16px 0 0 !important;
}

.app-shell__more-title {
  margin: 0 12px 4px;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: var(--v-medium-emphasis-opacity);
}

.app-shell__more-item {
  min-height: 48px;
}

.app-shell__more-item-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  margin-inline-end: 16px;
  align-items: center;
  justify-content: center;
}

.app-shell__more-item-icon :deep(svg) {
  width: 22px;
  height: 22px;
}

/* MobileBottomNavBar is position: fixed, not a Vuetify layout item, so VMain
   never learns to reserve space for it — without this, scrollable content
   (e.g. entity list feeds) renders its last rows underneath the nav bar. */
.app-shell__main--bottom-nav-space {
  padding-bottom: calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom));
}


</style>
