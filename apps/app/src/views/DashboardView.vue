<template>
  <div class="dashboard-view">
    <DashboardUpcomingMeetings />

    <div class="dashboard-view__divider" />

    <DashboardCharts />

    <VBtn
      v-if="isDev"
      variant="text"
      color="primary"
      :to="{ path: '/dev' }"
      size="small"
      class="mt-4"
    >
      {{ t("rep.dev.linkToDevTools") }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import DashboardUpcomingMeetings from "../components/DashboardUpcomingMeetings.vue";
import DashboardCharts from "../components/DashboardCharts.vue";

const { t } = useI18n();
const isDev = import.meta.env.DEV;
</script>

<style scoped>
.dashboard-view {
  max-width: 100%;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.dashboard-view__divider {
  height: 1px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  margin: 20px 4px;
}
</style>
