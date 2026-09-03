<template>
  <div class="sleep-studies-view">
    <AppEntityList
      view-id="sleep-studies"
      api-endpoint="/api/v1/sleep-study"
      :cacheable="false"
      :headers="tableHeaders"
      :filter-definitions="filterDefinitions"
      :i18n="listI18n"
      detail-route-name="patient-detail"
      detail-route-param="patient_id"
      :detail-route-query="() => ({ tab: 'studies' })"
      :filter-param-keys="['status']"
    >
      <template #item.patient_name="{ item }">
        {{ (item as { patient_name?: string }).patient_name || "—" }}
      </template>
      <template #feed-card-title="{ item }">
        {{ (item as { patient_name?: string }).patient_name || "—" }}
      </template>
      <template #item.status="{ item }">
        <VChip :color="statusColor((item as { status?: string }).status)" size="small" variant="tonal">
          {{ statusLabel((item as { status?: string }).status) }}
        </VChip>
      </template>
      <template #feed-card-status="{ item }">
        <VChip :color="statusColor((item as { status?: string }).status)" size="x-small" variant="tonal">
          {{ statusLabel((item as { status?: string }).status) }}
        </VChip>
      </template>
      <template #item.study_date="{ item }">
        {{ (item as { study_date?: string }).study_date ? new Date((item as { study_date?: string }).study_date!).toLocaleDateString() : "—" }}
      </template>
      <template #item.ahi_score="{ item }">
        {{ (item as { ahi_score?: number | null }).ahi_score ?? "—" }}
      </template>
      <template #item.interpreted_by_name="{ item }">
        {{ (item as { interpreted_by_name?: string | null }).interpreted_by_name || "—" }}
      </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import type { FilterDefinition } from "../composables/useFilters";

const { t } = useI18n();

const STATUSES = ["ordered", "device_shipped", "device_delivered", "study_complete", "results_received", "interpreted", "cancelled"];

function statusKey(status: string): string {
  return status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const statusOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  ...STATUSES.map((s) => ({ title: t(`app.sleepStudies.status.${statusKey(s)}`), value: s })),
]);

const filterDefinitions = computed<FilterDefinition[]>(() => [
  { key: "status", labelKey: "app.sleepStudies.table.status", type: "select", default: "", options: statusOptions.value },
]);

function statusColor(status?: string): string {
  switch (status) {
    case "interpreted": return "success";
    case "results_received":
    case "study_complete": return "info";
    case "cancelled": return "default";
    default: return "warning";
  }
}

function statusLabel(status?: string): string {
  return status ? t(`app.sleepStudies.status.${statusKey(status)}`) : "—";
}

const tableHeaders = computed(() => [
  { title: t("app.sleepStudies.table.patient"), key: "patient_name", sortable: false },
  { title: t("app.sleepStudies.table.status"), key: "status", sortable: true },
  { title: t("app.sleepStudies.table.studyDate"), key: "study_date", sortable: true },
  { title: t("app.sleepStudies.table.ahiScore"), key: "ahi_score", sortable: false },
  { title: t("app.sleepStudies.table.interpretedBy"), key: "interpreted_by_name", sortable: false },
]);

const listI18n = computed(() => ({
  searchPlaceholder: "app.sleepStudies.searchPlaceholder",
  filtersTitle: "app.patients.filters.title",
  filtersClear: "app.patients.filters.clear",
  add: "app.sleepStudies.title",
  emptyTitle: "app.sleepStudies.emptyTitle",
  emptySubtitle: "app.sleepStudies.emptySubtitle",
  noResultsForCriteria: "app.patients.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "app.patients.noResultsForCriteriaSubtitle",
  tableNoResults: "app.sleepStudies.table.noResults",
  errorLoad: "app.sleepStudies.errorLoad",
}));
</script>
