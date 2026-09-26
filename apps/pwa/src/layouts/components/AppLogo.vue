<template>
  <RouterLink
    :to="homePath"
    class="layout-app__bar-logo-link"
    aria-label="NeoSleep – Home"
    @click="$emit('close')"
  >
    <BrandLogo
      :dark="isDark"
      :light-src="configStore.config.logo_url"
      :dark-src="configStore.config.logo_dark_url"
      alt="NeoSleep"
      class="layout-app__logo-wordmark"
    />
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { BrandLogo } from "@ui";
import { homePathForRole } from "../../router/routes";
import { useAuthStore } from "../../stores/auth";
import { useConfigStore } from "../../stores/config";
import { useRolePreviewStore } from "../../stores/rolePreview";

const props = defineProps<{
  theme?: "light" | "dark";
}>();

const configStore = useConfigStore();
const isDark = computed(() => props.theme === "dark");

const authStore = useAuthStore();
const rolePreviewStore = useRolePreviewStore();
const homePath = computed(() => homePathForRole(rolePreviewStore.previewRole ?? authStore.user?.role));

defineEmits<{
  close: [];
}>();
</script>

<style scoped>
/* Wordmark: same proportions as website (140×32). Height pinned to
   --appbar-row (AppShell.vue) so it stays level with the hamburger and
   title without its own tuning — 28px is the fallback outside the shell. */
.layout-app__logo-wordmark {
  height: var(--appbar-row, 28px);
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
