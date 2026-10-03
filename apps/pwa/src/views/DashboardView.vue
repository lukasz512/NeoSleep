<template>
  <div class="dashboard-view">
    <div class="dashboard-view__header">
      <p class="dashboard-view__placeholder">{{ t("user.dashboard.title") }}</p>
      <AppNotificationCenter />
    </div>
    <DeviceOrderReconciliationCard mode="full" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppNotificationCenter from "../components/AppNotificationCenter.vue";
import DeviceOrderReconciliationCard from "../components/DeviceOrderReconciliationCard.vue";

const { t } = useI18n();
</script>

<style scoped>
.dashboard-view {
  display: grid;
  /* Rows as tall as their content: the view fills the page, and stretched rows made the card full-height (NEO-218 dev check). */
  align-content: start;
  gap: 16px;
  max-width: 100%;
  padding: 16px 0;
}

.dashboard-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dashboard-view__placeholder {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.9375rem;
}
</style>
