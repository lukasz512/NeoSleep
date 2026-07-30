<template>
  <!-- VAppBar registers with Vuetify's layout system before VNavigationDrawer
       so it claims the full top-of-viewport width; the drawer then registers
       below it, on the left, rather than the app-bar being squeezed to the
       right of a full-height drawer. -->
  <VAppBar
    flat
    :border="mobile ? false : 'b'"
    :height="56"
    class="app-shell__bar"
    :class="{ 'app-shell__bar--visible': shellVisible }"
  >
    <template v-if="mobile" #prepend>
      <VBtn
        icon
        variant="text"
        size="small"
        :aria-label="menuLabel"
        :aria-expanded="drawerOpenModel"
        @click="drawerOpenModel = !drawerOpenModel"
      >
        <slot name="menu-icon">
          <span class="app-shell__hamburger" aria-hidden="true">
            <span /><span /><span />
          </span>
        </slot>
      </VBtn>
    </template>

    <VAppBarTitle class="app-shell__title">
      <slot name="app-bar-title" />
    </VAppBarTitle>

    <template #append>
      <slot name="app-bar-actions" />
      <div class="app-shell__bar-logo">
        <slot name="logo" :collapsed="false" location="bar" />
      </div>
    </template>
  </VAppBar>

  <VNavigationDrawer
    v-model="drawerOpenModel"
    :permanent="!mobile"
    :temporary="mobile"
    :rail="!mobile && railCollapsed"
    :width="width"
    :rail-width="railWidth"
    :aria-label="menuLabel"
    color="surface-container-low"
    class="app-shell__nav"
    :class="{ 'app-shell__nav--visible': contentVisible }"
  >
    <div class="app-shell__logo">
      <slot name="logo" :collapsed="!mobile && railCollapsed" location="nav" />
    </div>
    <slot name="nav" />

    <template #append>
      <VDivider />
      <div class="app-shell__nav-footer">
        <slot name="drawer-footer" />
      </div>
    </template>
  </VNavigationDrawer>

  <VMain
    class="app-shell__main"
    :class="{
      'app-shell__main--bottom-nav-space': mobile && showBottomNav,
      'app-shell__main--visible': contentVisible,
    }"
  >
    <slot />
  </VMain>

  <MobileBottomNavBar
    v-if="mobile && showBottomNav"
    :aria-label="menuLabel"
    class="app-shell__bottom-nav"
    :class="{ 'app-shell__bottom-nav--visible': shellVisible }"
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
    <slot name="bottom-nav-extra" />
  </MobileBottomNavBar>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useDisplay } from "vuetify";
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
 * a single VNavigationDrawer that's permanent + rail-collapsible on desktop
 * and Vuetify's own temporary (scrim + slide) drawer on mobile — driven by
 * `useDisplay().mobile`, no branching between two different drawer
 * components — a VAppBar, a mobile bottom nav bar (the shared
 * MobileBottomNavBar/MobileBottomNavItem, same feel as apps/web's) showing
 * the first 4 nav items (full stop — no "more"/overflow button; the
 * hamburger in the app bar is always available as the way to reach
 * everything else), and a VMain for routed content.
 *
 * Deliberately has no knowledge of roles, auth, theming, or branding — those
 * are app-specific concerns supplied via slots (logo, nav, app-bar-actions,
 * drawer-footer) so apps/pwa can plug in its own content. Only apps/pwa
 * consumes AppShell today — apps/web has its own DefaultHeader, built on the
 * separately-exported MobileNavDrawer instead, since apps/web doesn't use
 * Vuetify anywhere else.
 */
const props = withDefaults(
  defineProps<{
    /** v-model: drawer open (mobile temporary drawer, or forced-open desktop). */
    modelValue?: boolean;
    /** Desktop rail (icon-only collapsed) mode. Ignored on mobile. */
    railCollapsed?: boolean;
    /** Nav items — the mobile bottom bar shows exactly the first 4. */
    navItems?: AppShellNavItem[];
    showBottomNav?: boolean;
    /** Show text labels under the bottom-nav icons (apps/web keeps them icon-only). */
    bottomNavShowLabels?: boolean;
    menuLabel?: string;
    width?: number;
    railWidth?: number;
  }>(),
  {
    modelValue: false,
    railCollapsed: false,
    navItems: () => [],
    showBottomNav: true,
    bottomNavShowLabels: false,
    menuLabel: "Menu",
    width: 220,
    railWidth: 56,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const { mobile } = useDisplay();

// On desktop the drawer is `:permanent`, which only affects the scrim/closability
// — Vuetify still renders it translated off-screen unless its own v-model reports
// "open". Since this v-model is also the mobile hamburger's open/close toggle
// (defaults closed), forcing it through unchanged would leave the desktop drawer
// closed on first paint. So: report true whenever not mobile, and only defer to
// the real toggle state while mobile (temporary) drawer behavior actually applies.
const drawerOpenModel = computed({
  get: () => (mobile.value ? props.modelValue : true),
  set: (value: boolean) => emit("update:modelValue", value),
});

const primaryNavItems = computed(() => props.navItems.slice(0, BOTTOM_NAV_ITEM_COUNT));

// One-time entrance, played whenever this shell first mounts (i.e. right
// after the auth screen's own exit sequence, see AuthView.vue) — the bar
// slides down from above and the mobile bottom nav slides up from below at
// the same time, then the drawer/main content fade in a beat later rather
// than everything appearing at once.
const CONTENT_ENTER_DELAY = 150;

const shellVisible = ref(false);
const contentVisible = ref(false);

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

onMounted(async () => {
  if (prefersReducedMotion) {
    shellVisible.value = true;
    contentVisible.value = true;
    return;
  }
  shellVisible.value = true;
  await wait(CONTENT_ENTER_DELAY);
  contentVisible.value = true;
});
</script>

<style scoped>
/* Entrance only (see shellVisible/contentVisible in <script>) — slides down
   from above the viewport rather than just fading, so the bar reads as
   dropping into place. */
.app-shell__bar {
  opacity: 0;
  transform: translateY(-100%);
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-shell__bar--visible {
  opacity: 1;
  transform: translateY(0);
}

/* Same idea, mirrored for the drawer/main content — a plain fade (no slide),
   starting a beat after the bar/bottom-nav above so the whole shell doesn't
   pop in as one flat block. */
.app-shell__nav,
.app-shell__main {
  opacity: 0;
  transition: opacity 0.35s ease-out;
}

.app-shell__nav--visible,
.app-shell__main--visible {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .app-shell__bar,
  .app-shell__nav,
  .app-shell__main {
    transition: none;
  }
}

.app-shell__logo {
  flex-shrink: 0;
}

.app-shell__nav-footer {
  display: flex;
  justify-content: center;
  padding: 12px;
}

/* Hamburger, title, and logo default to vertical centering (Vuetify's
   .v-toolbar__content + .v-toolbar__prepend/__append all set
   align-items: center, with prepend/append also stretched to the bar's full
   height). Centering three items of very different intrinsic heights
   (a 20px icon glyph, a 1.1rem text line, a 28px logo image) doesn't read as
   one aligned row — each sits at its own visual center instead of sharing a
   line.

   Bottom-*flushing* the outer boxes isn't enough either: the hamburger is a
   VBtn, which is `display: inline-grid; align-items: center` internally
   (Vuetify's own VBtn.css) — its 14px icon glyph (3 bars × 2px + 2 gaps ×
   4px) stays centered inside the button's own 40px box (--v-btn-height 28px
   + 12px for a default-density icon button at size="small") regardless of
   how the outer box is aligned, a fixed 13px inset from the button's edge.
   So each item needs its own padding tuned to match that same 13px visual
   inset from the shared bottom line, not one flat value copied onto every
   box. */
.app-shell__bar :deep(.v-toolbar__content) {
  align-items: flex-end;
}

.app-shell__bar :deep(.v-toolbar__prepend),
.app-shell__bar :deep(.v-toolbar__append) {
  align-items: flex-end;
}

.app-shell__title {
  font-size: 1.1rem;
  font-weight: 600;
  padding-bottom: 6px;
}

.app-shell__bar-logo {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.app-shell__hamburger {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 20px;

  span {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: currentColor;
  }
}

/* MobileBottomNavBar is position: fixed, not a Vuetify layout item, so VMain
   never learns to reserve space for it — without this, scrollable content
   (e.g. entity list feeds) renders its last rows underneath the nav bar. */
.app-shell__main--bottom-nav-space {
  padding-bottom: calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom));
}

/* Entrance only (see shellVisible in <script>) — slides up from below the
   viewport, mirroring the app bar's slide-down above, rather than fading. */
.app-shell__bottom-nav {
  opacity: 0;
  transform: translateY(100%);
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-shell__bottom-nav--visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .app-shell__bottom-nav {
    transition: none;
  }
}

</style>
