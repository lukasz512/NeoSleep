<template>
  <!-- Sidebar: full block with separator. Drawer: parent wraps, we render only the link. -->
  <div
    v-if="variant === 'sidebar'"
    class="layout-app__logo"
    :class="{ 'layout-app__logo--collapsed': collapsed }"
  >
    <router-link
      :to="appHomePath"
      class="layout-app__logo-link"
      aria-label="NeoSleep – Home"
      :title="collapsed ? 'NeoSleep' : undefined"
    >
      <span class="layout-app__logo-icon" aria-hidden="true">
        <img v-if="logoUrl" :src="logoUrl" alt="" class="layout-app__logo-img" />
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </span>
      <span class="layout-app__logo-text" :aria-hidden="collapsed">NeoSleep</span>
    </router-link>
  </div>
  <router-link
    v-else
    :to="appHomePath"
    class="layout-app__logo-link layout-app__mobile-drawer-logo-link"
    aria-label="NeoSleep – Home"
    @click="$emit('close')"
  >
    <span class="layout-app__logo-icon layout-app__mobile-drawer-logo-icon" aria-hidden="true">
      <img v-if="logoUrl" :src="logoUrl" alt="" class="layout-app__logo-img" />
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </span>
    <span class="layout-app__mobile-drawer-logo-text">NeoSleep</span>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { appHomePath } from "../../router/routes";
import { BRAND_LOGO_URL } from "../../constants";

defineProps<{
  collapsed?: boolean;
  variant: "sidebar" | "drawer";
}>();

const logoUrl = computed(() => (BRAND_LOGO_URL && BRAND_LOGO_URL.trim() ? BRAND_LOGO_URL.trim() : ""));

defineEmits<{
  close: [];
}>();
</script>

<style lang="scss" scoped>
$sidebar-border: var(--rep-sidebar-border, #3a3a3a);
$sidebar-text: var(--rep-sidebar-text, #f5f5f5);

.layout-app__logo {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  height: calc(var(--rep-topbar-height, 56px) - 8px);
  margin-bottom: 16px;
  padding-bottom: 0;
  box-sizing: border-box;

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: $sidebar-border;
  }

  .layout-app__logo-link {
    display: flex;
    align-items: center;
    gap: 10px;
    color: $sidebar-text;
    text-decoration: none;
    padding: 8px 10px;
    margin: -8px 0;
    transition: gap 0.25s ease, padding 0.25s ease;
    -webkit-tap-highlight-color: transparent;

    &:hover,
    &:focus-visible {
      color: $sidebar-text;
      outline: none;
    }
  }

  .layout-app__logo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;

    svg,
    .layout-app__logo-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  .layout-app__logo-text {
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    max-width: 160px;
    transition: opacity 0.2s ease, max-width 0.25s ease;
  }

  &--collapsed .layout-app__logo-link {
    justify-content: center;
    gap: 0;
    padding: 8px 0;
    margin: -8px 0;
    overflow: hidden;
  }

  &--collapsed .layout-app__logo-text {
    max-width: 0;
    min-width: 0;
    opacity: 0;
    visibility: hidden;
    overflow: hidden;
  }
}
</style>
