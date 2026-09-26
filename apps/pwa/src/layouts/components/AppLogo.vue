<template>
  <RouterLink
    :to="homePath"
    class="layout-app__bar-logo-link"
    aria-label="NeoSleep – Home"
    @click="$emit('close')"
  >
    <!-- A tenant's own logo (app_config) is an opaque image: shown as is,
         it cannot fold. The built-in NeoSleep wordmark folds into its O
         when the app bar runs out of room (NEO-108). -->
    <BrandLogo
      v-if="tenantLogo"
      :dark="isDark"
      :light-src="configStore.config.logo_url"
      :dark-src="configStore.config.logo_dark_url"
      alt="NeoSleep"
      class="layout-app__logo-wordmark"
      :style="{ height: `${height}px` }"
    />
    <BrandWordmarkFold
      v-else
      :dark="isDark"
      :folded="folded"
      :height="height"
      :mark-size="markSize"
    />
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { BrandLogo, BrandWordmarkFold } from "@ui";
import { homePathForRole } from "../../router/routes";
import { useAuthStore } from "../../stores/auth";
import { useConfigStore } from "../../stores/config";
import { useRolePreviewStore } from "../../stores/rolePreview";

const props = withDefaults(
  defineProps<{
    theme?: "light" | "dark";
    /** Wordmark height, CSS px (desktop 28, phone 18). */
    height?: number;
    /** Fold into the O mark (only the built-in wordmark can). */
    folded?: boolean;
    /** Folded O width, CSS px. */
    markSize?: number;
  }>(),
  { theme: "light", height: 28, folded: false, markSize: 32 },
);

const configStore = useConfigStore();
const isDark = computed(() => props.theme === "dark");
const tenantLogo = computed(() => !!(configStore.config.logo_url || configStore.config.logo_dark_url));

const authStore = useAuthStore();
const rolePreviewStore = useRolePreviewStore();
const homePath = computed(() => homePathForRole(rolePreviewStore.previewRole ?? authStore.user?.role));

defineEmits<{
  close: [];
}>();
</script>

<style scoped>
/* Tenant logo image: height set by the caller, width follows its ratio. */
.layout-app__logo-wordmark {
  width: auto;
  display: block;
  object-fit: contain;
}

/* Plain wordmark, no separator — matches login/web logo */
.layout-app__bar-logo-link {
  display: flex;
  align-items: center;
  color: var(--pwa-sidebar-text, #f5f5f5);
  text-decoration: none;
  /* No inline padding: the wordmark's left edge is placed by AppShell's
     --app-shell-bar-start-inset (aligned with the side-menu icons). */
  padding: 8px 0;
  -webkit-tap-highlight-color: transparent;

  &:hover,
  &:focus-visible {
    color: var(--pwa-sidebar-text, #f5f5f5);
    outline: none;
  }
}
</style>
