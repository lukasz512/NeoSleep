<template>
  <div class="clients-view">
    <RepEntityList
      view-id="clients"
      api-endpoint="/api/clients"
      :headers="tableHeaders"
      :filter-definitions="clientFilterDefs"
      :filter-definitions-with-options="clientFilterDefinitions"
      :i18n="clientsI18n"
      :show-add-button="false"
      :filter-param-keys="['status', 'region']"
    >
      <template #item.status="{ item }">
        <VChip
          :color="statusColor((item as { status?: string }).status)"
          size="small"
          variant="tonal"
        >
          {{ (item as { status?: string }).status }}
        </VChip>
      </template>
    </RepEntityList>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import RepEntityList from "../components/RepEntityList.vue";
import { type RepFilterDefinition } from "../composables/useRepFilters";
import { useConfigStore } from "../stores/config";

const { t } = useI18n();
const configStore = useConfigStore();

const clientFilterDefs: RepFilterDefinition[] = [
  { key: "status", labelKey: "rep.clients.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "rep.clients.filters.region", type: "select", default: "" },
];

const statusOptions = computed(() => [
  { title: t("rep.clients.filters.all"), value: "" },
  { title: t("rep.clients.filters.statusActive"),     value: "active" },
  { title: t("rep.clients.filters.statusFollowUp"),   value: "follow-up" },
  { title: t("rep.clients.filters.statusDischarged"), value: "discharged" },
]);

const regionOptions = computed(() => [
  { title: t("rep.clients.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const clientFilterDefinitions = computed<RepFilterDefinition[]>(() => [
  { ...clientFilterDefs[0], options: statusOptions.value },
  { ...clientFilterDefs[1], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("rep.clients.table.name"),       key: "name",        sortable: true },
  { title: t("rep.clients.table.reason"),     key: "reason",      sortable: false },
  { title: t("rep.clients.table.referredBy"), key: "referred_by", sortable: true },
  { title: t("rep.clients.table.status"),     key: "status",      sortable: true },
  { title: t("rep.clients.table.region"),     key: "region",      sortable: true },
]);

const clientsI18n = computed(() => ({
  searchPlaceholder:            "rep.clients.searchPlaceholder",
  filtersTitle:                 "rep.clients.filters.title",
  filtersClear:                 "rep.clients.filters.clear",
  add:                          "rep.clients.add",
  emptyTitle:                   "rep.clients.emptyTitle",
  emptySubtitle:                "rep.clients.emptySubtitle",
  noResultsForCriteria:         "rep.clients.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "rep.clients.noResultsForCriteriaSubtitle",
  tableNoResults:               "rep.clients.table.noResults",
  errorLoad:                    "rep.clients.errorLoad",
}));

function statusColor(status?: string): string {
  switch (status) {
    case "active":     return "success";
    case "follow-up":  return "warning";
    case "discharged": return "default";
    default:           return "default";
  }
}
</script>
