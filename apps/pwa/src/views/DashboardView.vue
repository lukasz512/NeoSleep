<template>
  <div class="dashboard-view">
    <div class="dashboard-view__header">
      <p class="dashboard-view__placeholder">{{ t("user.dashboard.title") }}</p>
    </div>
    <DeviceOrderReconciliationCard mode="full" />
    <DeviceOrderCommentsCard v-if="isAdmin" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import DeviceOrderReconciliationCard from "../components/DeviceOrderReconciliationCard.vue";
import DeviceOrderCommentsCard from "../components/dashboard/DeviceOrderCommentsCard.vue";
import { useAuthStore } from "../stores/auth";

const { t } = useI18n();
const authStore = useAuthStore();
/** The Panel is admin-only today; the guard keeps the card admin-only if that ever changes. */
const isAdmin = computed(() => authStore.user?.role === "admin");
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
