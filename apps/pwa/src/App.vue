<template>
  <AppNotifications />
  <component :is="layoutComponent" />
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { PublicLayout, AppLayout } from "./router";
import { useDocumentLang } from "@i18n/useDocumentLang";
import { dismissBootSplash } from "./boot/bootSplash";
import AppNotifications from "./components/AppNotifications.vue";

const { locale } = useI18n();
useDocumentLang(locale);

const route = useRoute();
const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || "default";
  return name === "app" ? AppLayout : PublicLayout;
});

// Children mount first, so whichever layout is showing has already rendered
// underneath the static HTML boot splash (src/boot/splash.ts) by now — fade
// the splash off the top of it.
onMounted(dismissBootSplash);
</script>
