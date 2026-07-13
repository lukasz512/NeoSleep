<template>
  <component :is="layoutComponent" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { PublicLayout, AppLayout } from "./router";
import { useDocumentLang } from "@i18n/useDocumentLang";

const { locale } = useI18n();
useDocumentLang(locale);

const route = useRoute();
const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || "default";
  return name === "app" ? AppLayout : PublicLayout;
});
</script>
