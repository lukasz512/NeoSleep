<template>
  <VNavigationDrawer
    v-model="drawerOpenModel"
    :rail="!mobile && railCollapsed"
    :permanent="!mobile"
    :temporary="mobile"
    :width="width"
    :rail-width="railWidth"
    class="app-shell__nav"
  >
    <div class="app-shell__logo">
      <slot name="logo" :collapsed="!mobile && railCollapsed" />
    </div>
    <slot name="nav" />

    <template #append>
      <VDivider />
      <div class="app-shell__nav-footer">
        <slot name="drawer-footer" />
      </div>
    </template>
  </VNavigationDrawer>

  <VAppBar flat border="b" :height="56" class="app-shell__bar">
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
      <div v-if="mobile" class="app-shell__bar-logo">
        <slot name="logo" :collapsed="false" />
      </div>
    </template>
  </VAppBar>

  <VMain class="app-shell__main">
    <slot />
  </VMain>

  <VBottomNavigation
    v-if="mobile && showBottomNav"
    grow
    :height="64"
    class="app-shell__bottom-nav"
  >
    <VBtn
      v-for="item in primaryNavItems"
      :key="item.path"
      :to="item.path"
      class="app-shell__bottom-nav-btn"
    >
      <slot name="nav-icon" :item="item" />
      <span class="app-shell__bottom-nav-label">{{ item.label }}</span>
    </VBtn>
    <slot name="bottom-nav-extra" />
  </VBottomNavigation>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDisplay } from "vuetify";

export interface AppShellNavItem {
  path: string;
  label: string;
  /** Opaque identifier apps can use to resolve an icon in the #nav-icon slot — AppShell doesn't interpret it. */
  name?: string;
}

const BOTTOM_NAV_ITEM_COUNT = 4;

/**
 * Shared responsive app shell (packages/ui) — the structural chrome only:
 * a left VNavigationDrawer (permanent on desktop, temporary + hamburger-
 * triggered on mobile), a VAppBar, a mobile VBottomNavigation showing the
 * first 4 nav items (full stop — no "more"/overflow button; the hamburger
 * in the app bar is always available as the way to reach everything else),
 * and a VMain for routed content.
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
    menuLabel?: string;
    width?: number;
    railWidth?: number;
  }>(),
  {
    modelValue: false,
    railCollapsed: false,
    navItems: () => [],
    showBottomNav: true,
    menuLabel: "Menu",
    width: 220,
    railWidth: 56,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const { mobile } = useDisplay();

const drawerOpenModel = computed({
  get: () => props.modelValue,
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

.app-shell__bottom-nav-btn {
  text-transform: none;
  letter-spacing: normal;
}

.app-shell__bottom-nav-label {
  font-size: 0.6875rem;
}
</style>
