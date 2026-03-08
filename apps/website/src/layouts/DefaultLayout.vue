<template>
  <div class="layout-default" :class="{ 'layout-default--dark': isDark }">
    <DefaultHeader />
    <main class="layout-default__main">
      <RouterView />
    </main>
    <DefaultFooter />
  </div>
</template>

<script setup lang="ts">
import { useTheme } from "../composables/useTheme";
import DefaultHeader from "./DefaultHeader.vue";
import DefaultFooter from "./DefaultFooter.vue";

const { isDark } = useTheme();
</script>

<style lang="scss" scoped>
.layout-default {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-default__main {
  flex: 1;
  position: relative;
  z-index: 2;
  padding-top: 5rem; /* space for fixed header + wave */
}
</style>
