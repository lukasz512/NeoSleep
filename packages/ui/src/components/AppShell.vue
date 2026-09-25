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
      <div class="app-shell__bar-end">
        <slot name="app-bar-actions" :mobile="mobile" />
      </div>
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

  <!-- NEO-55: the bottom bar expands in place into a grid of every module
       ("More" → close chevron) — see MobileNavPanel for the transition. -->
  <MobileNavPanel
    v-if="mobile && showBottomNav"
    :items="navItems"
    :primary-count="BOTTOM_NAV_ITEM_COUNT"
    :show-labels="bottomNavShowLabels"
    :aria-label="menuLabel"
    :more-label="moreLabel"
    :close-label="closeLabel"
    class="app-shell__bottom-nav"
    :class="enterClass"
    :style="{ '--app-shell-enter-order': 3 }"
  >
    <template #icon="{ item }">
      <slot name="nav-icon" :item="item" />
    </template>
  </MobileNavPanel>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useDisplay } from "vuetify";
import MobileNavPanel from "./MobileNavPanel.vue";

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
 * bottom nav bar (MobileNavPanel, built from the shared MobileBottomNavItem,
 * same feel as apps/web's) with the first 4 nav items plus a "More" tab that
 * expands the bar into a grid of every module (NEO-55 — one visible
 * navigation, no hamburger), and a VMain for routed content.
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
    /** Label of the "More" tab while expanded (it closes the grid). */
    closeLabel?: string;
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
    closeLabel: "Close",
    width: 220,
    railWidth: 56,
  },
);

const { mobile } = useDisplay();
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

/* The content card: rounded on all four corners and set into the chrome on
   every side — the bar above, the drawer on the left, and a chrome gutter on
   the right and bottom. Page scroll is on the window (views such as
   ResourcesView read window.scrollY), so rounding the content itself would
   scroll its corners away. Instead one fixed, pointer-transparent frame sits
   exactly over the card's visible area: its box-shadow (which follows the
   border-radius) paints chrome outside the rounded rectangle — the four
   corners plus the right/bottom gutters — and clip-path keeps that shadow off
   the bar and drawer. --v-layout-top/left are Vuetify's own layout offsets
   (bar height, drawer or rail width), so it follows rail collapse. VMain's
   own right/bottom padding grows by the gutter so content never ends up
   underneath it. */
.app-shell__main--inset {
  --app-shell-card-radius: 16px;
  --app-shell-card-gutter: 12px;
  padding-right: calc(var(--v-layout-right) + var(--app-shell-card-gutter));
  padding-bottom: calc(var(--v-layout-bottom) + var(--app-shell-card-gutter));
}

.app-shell__main--inset::before {
  content: "";
  position: fixed;
  top: var(--v-layout-top);
  left: var(--v-layout-left);
  right: var(--app-shell-card-gutter);
  bottom: var(--app-shell-card-gutter);
  z-index: 1003;
  pointer-events: none;
  border-radius: var(--app-shell-card-radius);
  box-shadow: 0 0 0 100vmax rgb(var(--v-theme-surface-container-low));
  clip-path: inset(0 calc(-1 * var(--app-shell-card-gutter)) calc(-1 * var(--app-shell-card-gutter)) 0);
  /* Same timing as Vuetify's own .v-main padding transition, so the frame
     tracks the drawer edge during rail collapse/expand. */
  transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* No divider/border above this footer — removed per explicit feedback ("ta linia
   nad userem ma znikac"). Round 2 had gone the opposite way (adding an explicit
   border-top because the default VDivider read as invisible) on a misreading of
   the original ask; this corrects that. */
.app-shell__nav-footer {
  --app-shell-nav-footer-pad: 12px;
  display: flex;
  justify-content: center;
  padding: var(--app-shell-nav-footer-pad);
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
   label right after the edge. Here the app sets it (--app-shell-title-inset),
   so a title that leads the bar can line up with the page content below. */
.app-shell__bar :deep(.v-toolbar__content > .v-toolbar-title) {
  margin-inline-start: var(--app-shell-title-inset, 8px);
}

/* The bar's two outer edges are set by the app, so its leading/trailing
   content can line up with the app's own content below (apps/pwa: logo with
   the side-menu icons, avatar with the page-header icons — see AppLayout's
   shell edge tokens). Vuetify's own prepend/append margins are zeroed so
   these insets are the only offset from the viewport edge. */
.app-shell__bar :deep(.v-toolbar__prepend) {
  margin-inline-start: 0;
}

.app-shell__bar :deep(.v-toolbar__append) {
  margin-inline-end: 0;
}

.app-shell__bar-start {
  display: flex;
  align-items: center;
  min-height: var(--appbar-row);
  padding-inline-start: var(--app-shell-bar-start-inset, 8px);
}

.app-shell__bar-end {
  display: flex;
  align-items: center;
  padding-inline-end: var(--app-shell-bar-end-inset, 8px);
}

/* Back arrow + title read as one "← Patients" label on mobile. */
.app-shell__bar :deep(.v-toolbar__prepend:has(.app-shell__bar-start:not(:empty)) + .v-toolbar-title) {
  margin-inline-start: 0;
}

.app-shell__bar-start:empty {
  display: none;
}

/* The bottom nav (MobileNavPanel) is position: fixed, not a Vuetify layout item, so VMain
   never learns to reserve space for it — without this, scrollable content
   (e.g. entity list feeds) renders its last rows underneath the nav bar. */
.app-shell__main--bottom-nav-space {
  padding-bottom: calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom));
}


</style>
