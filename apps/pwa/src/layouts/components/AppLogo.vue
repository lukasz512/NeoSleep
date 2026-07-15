<template>
  <!-- Sidebar: full block with separator. Drawer: parent wraps, we render only the link. -->
  <div
    v-if="variant === 'sidebar'"
    class="layout-app__logo"
    :class="{ 'layout-app__logo--collapsed': collapsed }"
  >
    <RouterLink
      :to="appHomePath"
      class="layout-app__logo-link"
      aria-label="NeoSleep – Home"
      :title="collapsed ? 'NeoSleep' : undefined"
    >
      <!-- Collapsed: icon only -->
      <span v-if="collapsed" class="layout-app__logo-icon" aria-hidden="true">
        <img v-if="iconUrl" :src="iconUrl" alt="" class="layout-app__logo-icon-img" />
        <AppIcon v-else name="moon" />
      </span>
      <!-- Expanded: full wordmark -->
      <img v-else-if="logoUrl" :src="logoUrl" alt="NeoSleep" class="layout-app__logo-wordmark" />
      <span v-else class="layout-app__logo-text">NeoSleep</span>
    </RouterLink>
  </div>
  <RouterLink
    v-else
    :to="appHomePath"
    class="layout-app__logo-link layout-app__mobile-drawer-logo-link"
    aria-label="NeoSleep – Home"
    @click="$emit('close')"
  >
    <img v-if="logoUrl" :src="logoUrl" alt="NeoSleep" class="layout-app__logo-wordmark" />
    <span v-else class="layout-app__mobile-drawer-logo-text">NeoSleep</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { appHomePath } from "../../router/routes";
import AppIcon from "../../components/AppIcon.vue";
import {
  BRAND_LOGO_LIGHT_URL,
  BRAND_LOGO_DARK_URL,
  BRAND_ICON_LIGHT_URL,
  BRAND_ICON_DARK_URL,
} from "../../constants";
import { useConfigStore } from "../../stores/config";

const props = defineProps<{
  collapsed?: boolean;
  variant: "sidebar" | "drawer";
  theme?: "light" | "dark";
}>();

const configStore = useConfigStore();

// Tenant branding from DB, fallback to static /brand/ assets for default NeoSleep instance.
const logoUrl = computed(() => {
  const dark = props.theme === "dark";
  return (dark ? configStore.config.logo_dark_url : configStore.config.logo_url)
    ?? (dark ? BRAND_LOGO_DARK_URL : BRAND_LOGO_LIGHT_URL);
});

const iconUrl = computed(() => {
  const dark = props.theme === "dark";
  return (dark ? configStore.config.icon_dark_url : configStore.config.icon_url)
    ?? (dark ? BRAND_ICON_DARK_URL : BRAND_ICON_LIGHT_URL);
});

defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.layout-app__logo {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  height: calc(var(--pwa-topbar-height, 56px) - 8px);
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
    background: var(--pwa-sidebar-border, #3a3a3a);
  }

  .layout-app__logo-link {
    display: flex;
    align-items: center;
    color: var(--pwa-sidebar-text, #f5f5f5);
    text-decoration: none;
    padding: 8px 4px;
    margin: -8px 0;
    -webkit-tap-highlight-color: transparent;

    &:hover,
    &:focus-visible {
      color: var(--pwa-sidebar-text, #f5f5f5);
      outline: none;
    }
  }
}

/* Wordmark: same proportions as website (140×32) */
.layout-app__logo-wordmark {
  height: 28px;
  width: auto;
  display: block;
  object-fit: contain;
}

/* Collapsed: icon only */
.layout-app__logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.layout-app__logo-icon-img,
.layout-app__logo-icon svg {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Fallback text when no logo URL */
.layout-app__logo-text {
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* Drawer variant */
.layout-app__mobile-drawer-logo-link {
  display: flex;
  align-items: center;
  color: var(--pwa-sidebar-text, #f5f5f5);
  text-decoration: none;
  padding: 8px 4px;
  -webkit-tap-highlight-color: transparent;

  &:hover,
  &:focus-visible {
    color: var(--pwa-sidebar-text, #f5f5f5);
    outline: none;
  }
}

.layout-app__mobile-drawer-logo-text {
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
