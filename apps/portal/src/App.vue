<template>
  <component :is="layoutComponent" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { DefaultLayout, AppLayout } from "./router";

const route = useRoute();

const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || "default";
  return name === "app" ? AppLayout : DefaultLayout;
});
</script>

<style>
#app {
  font-family: system-ui, sans-serif;
}
</style>
