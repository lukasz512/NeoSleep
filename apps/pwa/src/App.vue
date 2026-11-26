<template>
  <AppNotifications />
  <component :is="layoutComponent" ref="layoutRef" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { PublicLayout, AppLayout } from "./router";
import { useDocumentLang } from "@i18n/useDocumentLang";
import { dismissBootSplash } from "./boot/bootSplash";
import AppNotifications from "./components/AppNotifications.vue";

const { locale } = useI18n();
useDocumentLang(locale);

const route = useRoute();
const targetLayout = computed(() => {
  const name = (route.meta.layout as string) || "default";
  return name === "app" ? AppLayout : PublicLayout;
});

// Public → app waits for the auth backdrop's exit (orbs swell, background
// dissolves) before swapping — see PublicLayout's exitToApp. Without it a
// page refresh with a live session cut from the backdrop straight to a blank
// page the moment the session check resolved.
const layoutComponent = shallowRef(targetLayout.value);
const layoutRef = ref<{ exitToApp?: () => Promise<void> } | null>(null);

watch(targetLayout, async (next) => {
  if (layoutComponent.value === PublicLayout && next === AppLayout) {
    await layoutRef.value?.exitToApp?.();
    if (targetLayout.value !== next) return;
  }
  layoutComponent.value = next;
});

// Children mount first, so whichever layout is showing has already rendered
// underneath the static HTML boot splash (src/boot/splash.ts) by now — fade
// the splash off the top of it.
onMounted(dismissBootSplash);
</script>
