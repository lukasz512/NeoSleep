<template>
  <DefaultLayout />
</template>

<script setup lang="ts">
import DefaultLayout from "./layouts/DefaultLayout.vue";
import { useSmoothScrollAnchors } from "./composables/useSmoothScrollAnchors";
import "./assets/website-theme.scss";

useSmoothScrollAnchors();
</script>

<style>
#app {
  font-family: var(--website-font-sans);
  background: var(--website-bg);
  color: var(--website-text);
}
</style>
