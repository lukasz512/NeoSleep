<template>
  <DefaultLayout>
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
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

.page-enter-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}
.page-leave-active {
  transition: opacity 0.18s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
.page-leave-to {
  opacity: 0;
}
</style>
