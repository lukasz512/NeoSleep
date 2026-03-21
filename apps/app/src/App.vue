<template>
  <component :is="layoutComponent" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { PublicLayout, AppLayout } from "./router";
import { useDocumentLang } from "@neo/shared/composables/useDocumentLang";

useDocumentLang();

const route = useRoute();
const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || "default";
  return name === "app" ? AppLayout : PublicLayout;
});
</script>
