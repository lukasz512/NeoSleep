<template>
  <div class="layout-default">
    <DefaultHeader />
    <main class="layout-default__main">
      <slot />
    </main>
    <DefaultFooter />
    <MobileBottomNav />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import DefaultHeader from "./DefaultHeader.vue";
import DefaultFooter from "./DefaultFooter.vue";
import MobileBottomNav from "../components/MobileBottomNav.vue";

onMounted(() => {
  console.log("[Layout] mounted");
});
</script>

<style scoped>
.layout-default {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-default__main {
  flex: 1;
  padding-top: var(--website-header-height);
}

@media (max-width: 1100px) {
  .layout-default {
    padding-bottom: var(--website-bottom-nav-height);
  }
}
</style>
