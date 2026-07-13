<template>
  <div class="dashboard-view">
    <p class="dashboard-view__placeholder">{{ t("user.dashboard.title") }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped>
.dashboard-view {
  max-width: 100%;
  padding: 16px 0;
}

.dashboard-view__placeholder {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.9375rem;
}
</style>
