<template>
  <div class="patients-view">
    <RepEntityList
      view-id="patients"
      api-endpoint="/api/patients"
      :headers="tableHeaders"
      :filter-definitions="patientFilterDefs"
      :filter-definitions-with-options="patientFilterDefinitions"
      :i18n="patientsI18n"
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
import { useRepFilters, type RepFilterDefinition } from "../composables/useRepFilters";
import { useConfigStore } from "../stores/config";

const { t } = useI18n();
const configStore = useConfigStore();

const patientFilterDefs: RepFilterDefinition[] = [
  { key: "status", labelKey: "rep.patients.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "rep.patients.filters.region", type: "select", default: "" },
];

const statusOptions = computed(() => [
  { title: t("rep.patients.filters.all"), value: "" },
  { title: "active",     value: "active" },
  { title: "follow-up",  value: "follow-up" },
  { title: "discharged", value: "discharged" },
]);

const regionOptions = computed(() => [
  { title: t("rep.patients.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const patientFilterDefinitions = computed<RepFilterDefinition[]>(() => [
  { ...patientFilterDefs[0], options: statusOptions.value },
  { ...patientFilterDefs[1], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("rep.patients.table.name"),       key: "name",        sortable: true },
  { title: t("rep.patients.table.diagnosis"),  key: "diagnosis",   sortable: false },
  { title: t("rep.patients.table.referredBy"), key: "referred_by", sortable: true },
  { title: t("rep.patients.table.status"),     key: "status",      sortable: true },
  { title: t("rep.patients.table.region"),     key: "region",      sortable: true },
]);

const patientsI18n = computed(() => ({
  searchPlaceholder:           "rep.patients.searchPlaceholder",
  filtersTitle:                "rep.patients.filters.title",
  filtersClear:                "rep.patients.filters.clear",
  add:                         "rep.patients.add",
  emptyTitle:                  "rep.patients.emptyTitle",
  emptySubtitle:               "rep.patients.emptySubtitle",
  noResultsForCriteria:        "rep.patients.noResultsForCriteria",
  noResultsForCriteriaSubtitle:"rep.patients.noResultsForCriteriaSubtitle",
  tableNoResults:              "rep.patients.table.noResults",
  errorLoad:                   "rep.patients.errorLoad",
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
