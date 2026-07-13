<template>
  <Transition name="offline-bar">
    <div v-if="!isOnline" class="app-offline-bar" role="alert" aria-live="assertive">
      {{ t("layout.offlineBar") }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useOnline } from "@vueuse/core";
import { useI18n } from "vue-i18n";

const isOnline = useOnline();
const { t } = useI18n();
</script>

<style scoped>
.app-offline-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: #b45309;
  color: #fff;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  letter-spacing: 0.01em;
}

.offline-bar-enter-active,
.offline-bar-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.offline-bar-enter-from,
.offline-bar-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
