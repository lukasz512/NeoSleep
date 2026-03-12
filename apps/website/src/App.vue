<template>
  <DefaultLayout>
    <RouterView />
  </DefaultLayout>
</template>

<script setup lang="ts">
import DefaultLayout from "./layouts/DefaultLayout.vue";
import { useSmoothScrollAnchors } from "./composables/useSmoothScrollAnchors";
import "./assets/website-theme.scss";

useSmoothScrollAnchors();
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
}

#app {
  font-family: var(--website-font-sans);
  background: var(--website-bg);
  color: var(--website-text);
  min-height: 100vh;
}
</style>
