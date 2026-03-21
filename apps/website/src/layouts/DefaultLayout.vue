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
import DefaultHeader from "./DefaultHeader.vue";
import DefaultFooter from "./DefaultFooter.vue";
import MobileBottomNav from "../components/MobileBottomNav.vue";
</script>
