<template>
  <div class="app-loading-state" role="status" aria-live="polite" :aria-label="label ?? t('layout.loader.label')">
    <AppSpinner size="48" width="4" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppSpinner from "./AppSpinner.vue";

defineProps<{
  label?: string;
}>();

const { t } = useI18n();
</script>

<style scoped>
.app-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}
</style>
