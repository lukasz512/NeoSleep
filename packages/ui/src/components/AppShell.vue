<template>
  <!-- VAppBar registers with Vuetify's layout system before VNavigationDrawer
       so it claims the full top-of-viewport width; the drawer then registers
       below it, on the left, rather than the app-bar being squeezed to the
       right of a full-height drawer. -->
  <VAppBar flat :border="mobile ? false : 'b'" :height="56" class="app-shell__bar">
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

  <MobileNavDrawer v-if="mobile" v-model="drawerOpenModel" :width="width" :aria-label="menuLabel">
    <template #header>
      <slot name="logo" :collapsed="false" location="nav" />
    </template>
    <slot name="nav" />
    <template #footer>
      <slot name="drawer-footer" />
    </template>
  </MobileNavDrawer>

  <VNavigationDrawer
    v-else
    v-model="drawerOpenModel"
    :rail="railCollapsed"
    permanent
    :width="width"
    :rail-width="railWidth"
    class="app-shell__nav"
  >
    <div class="app-shell__logo">
      <slot name="logo" :collapsed="railCollapsed" location="nav" />
    </div>
    <slot name="nav" />

    <template #append>
      <VDivider />
      <div class="app-shell__nav-footer">
        <slot name="drawer-footer" />
      </div>
    </template>
  </VNavigationDrawer>

  <VMain class="app-shell__main" :class="{ 'app-shell__main--bottom-nav-space': mobile && showBottomNav }">
    <slot />
  </VMain>

  <MobileBottomNavBar v-if="mobile && showBottomNav" :aria-label="menuLabel" class="app-shell__bottom-nav">
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
import { computed } from "vue";
import { useDisplay } from "vuetify";
import MobileNavDrawer from "./MobileNavDrawer.vue";
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
 * a left nav drawer (permanent + rail-collapsible VNavigationDrawer on
 * desktop; the shared MobileNavDrawer — hamburger-triggered, swipeable,
 * same feel as apps/web's — on mobile), a VAppBar, a mobile bottom nav bar
 * (the shared MobileBottomNavBar/MobileBottomNavItem, same feel as
 * apps/web's) showing the first 4 nav items (full stop — no "more"/overflow
 * button; the hamburger in the app bar is always available as the way to
 * reach everything else), and a VMain for routed content.
 *
 * Deliberately has no knowledge of roles, auth, theming, or branding — those
 * are app-specific concerns supplied via slots (logo, nav, app-bar-actions,
 * drawer-footer) so apps/pwa and apps/web can each plug in their own content
 * while sharing this same responsive mechanics.
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
</script>

<style scoped>
.app-shell__logo {
  flex-shrink: 0;
}

.app-shell__nav-footer {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.app-shell__title {
  font-size: 1.1rem;
  font-weight: 600;
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

</style>
