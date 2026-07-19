<template>
  <nav class="mobile-bottom-nav-bar" :aria-label="ariaLabel">
    <slot />
  </nav>
</template>

<script setup lang="ts">
/**
 * Shared bottom-nav bar container (packages/ui) — fixed-to-bottom flex row,
 * paired with MobileBottomNavItem. Ported from apps/web's .mbn container;
 * apps/pwa's AppShell now uses this too instead of Vuetify's own
 * VBottomNavigation, so both apps share one look.
 *
 * No opinion on *when* it's visible — apps/web toggles a wrapping element
 * via a CSS breakpoint (desktop has inline header nav instead), apps/pwa
 * mounts/unmounts it via v-if on Vuetify's `mobile` display breakpoint.
 * This component just renders its content full-bleed across the bottom
 * whenever it's mounted.
 */
withDefaults(
  defineProps<{
    ariaLabel?: string;
  }>(),
  { ariaLabel: "Mobile navigation" },
);
</script>

<style scoped>
.mobile-bottom-nav-bar {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 8px;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--mobile-bottom-nav-height, 64px);
  z-index: 9998;
  background: var(--mobile-bottom-nav-bg, #fff);
  border-top: 1px solid var(--mobile-bottom-nav-border, rgba(0, 0, 0, 0.12));
  border-top-left-radius: var(--mobile-bottom-nav-radius, 0);
  border-top-right-radius: var(--mobile-bottom-nav-radius, 0);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  padding-inline: 21px;
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
