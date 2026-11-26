<script setup lang="ts">
import { computed } from "vue";
import {
  BRAND_LOGO_LIGHT_URL,
  BRAND_LOGO_DARK_URL,
  BRAND_ICON_LIGHT_URL,
  BRAND_ICON_DARK_URL,
} from "@brand/logos";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** Full wordmark (icon + text) or icon-only mark. */
    variant?: "wordmark" | "icon";
    dark?: boolean;
    /** Tenant-config overrides (DB-driven white-label branding). Falls back to the static NeoSleep asset when unset. */
    lightSrc?: string | null;
    darkSrc?: string | null;
    alt?: string;
  }>(),
  {
    variant: "wordmark",
    dark: false,
    lightSrc: null,
    darkSrc: null,
    alt: "NeoSleep",
  },
);

const src = computed(() => {
  const fallbackLight = props.variant === "icon" ? BRAND_ICON_LIGHT_URL : BRAND_LOGO_LIGHT_URL;
  const fallbackDark = props.variant === "icon" ? BRAND_ICON_DARK_URL : BRAND_LOGO_DARK_URL;
  return props.dark ? (props.darkSrc ?? fallbackDark) : (props.lightSrc ?? fallbackLight);
});
</script>

<template>
  <img v-bind="$attrs" :src="src" :alt="alt" />
</template>
