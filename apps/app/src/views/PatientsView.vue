<template>
  <div class="patients-view">
    <AppEntityList
      view-id="patients"
      api-endpoint="/api/v1/patients"
      :headers="tableHeaders"
      :filter-definitions="patientFilterDefinitions"
      :i18n="patientsI18n"
      :show-add-button="false"
      :filter-param-keys="['status', 'region']"
    >
      <template #item.referred_by_source="{ item }">
        <VChip
          v-if="(item as { referred_by_source?: string }).referred_by_source"
          :color="sourceColor((item as { referred_by_source?: string }).referred_by_source)"
          size="small"
          variant="tonal"
        >
          {{ sourceLabel((item as { referred_by_source?: string }).referred_by_source!) }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip
          :color="statusColor((item as { status?: string }).status)"
          size="small"
          variant="tonal"
        >
          {{ (item as { status?: string }).status }}
        </VChip>
      </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import { type FilterDefinition } from "../composables/useFilters";
import { useConfigStore } from "../stores/config";

const { t } = useI18n();
const configStore = useConfigStore();

const patientFilterDefs: FilterDefinition[] = [
  { key: "status",             labelKey: "app.patients.filters.status",           type: "select", default: "" },
  { key: "region",             labelKey: "app.patients.filters.region",           type: "select", default: "" },
  { key: "referred_by_source", labelKey: "app.patients.filters.referredBySource", type: "select", default: "" },
];

const statusOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  { title: t("app.patients.filters.statusActive"),     value: "active" },
  { title: t("app.patients.filters.statusFollowUp"),   value: "follow-up" },
  { title: t("app.patients.filters.statusDischarged"), value: "discharged" },
]);

const regionOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const sourceOptions = computed(() => [
  { title: t("app.patients.filters.all"),                    value: "" },
  { title: t("app.patients.filters.sourceWebsite"),          value: "website" },
  { title: t("app.patients.filters.sourceInstagram"),        value: "instagram" },
  { title: t("app.patients.filters.sourceFacebook"),         value: "facebook" },
  { title: t("app.patients.filters.sourceHcpReferral"),      value: "hcp_referral" },
  { title: t("app.patients.filters.sourceEvent"),            value: "event" },
  { title: t("app.patients.filters.sourceOther"),            value: "other" },
]);

const patientFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...patientFilterDefs[0], options: statusOptions.value },
  { ...patientFilterDefs[1], options: regionOptions.value },
  { ...patientFilterDefs[2], options: sourceOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("app.patients.table.name"),             key: "name",               sortable: true },
  { title: t("app.patients.table.reason"),           key: "reason",             sortable: false },
  { title: t("app.patients.table.referredBy"),       key: "referred_by",        sortable: true },
  { title: t("app.patients.table.referredBySource"), key: "referred_by_source", sortable: true },
  { title: t("app.patients.table.status"),           key: "status",             sortable: true },
  { title: t("app.patients.table.region"),           key: "region",             sortable: true },
]);

const patientsI18n = computed(() => ({
  searchPlaceholder:            "app.patients.searchPlaceholder",
  filtersTitle:                 "app.patients.filters.title",
  filtersClear:                 "app.patients.filters.clear",
  add:                          "app.patients.add",
  emptyTitle:                   "app.patients.emptyTitle",
  emptySubtitle:                "app.patients.emptySubtitle",
  noResultsForCriteria:         "app.patients.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "app.patients.noResultsForCriteriaSubtitle",
  tableNoResults:               "app.patients.table.noResults",
  errorLoad:                    "app.patients.errorLoad",
}));

function statusColor(status?: string): string {
  switch (status) {
    case "active":     return "success";
    case "follow-up":  return "warning";
    case "discharged": return "default";
    default:           return "default";
  }
}

const SOURCE_LABEL_KEYS: Record<string, string> = {
  website:      "app.patients.filters.sourceWebsite",
  instagram:    "app.patients.filters.sourceInstagram",
  facebook:     "app.patients.filters.sourceFacebook",
  hcp_referral: "app.patients.filters.sourceHcpReferral",
  event:        "app.patients.filters.sourceEvent",
  other:        "app.patients.filters.sourceOther",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL_KEYS[source] ? t(SOURCE_LABEL_KEYS[source]) : source;
}

function sourceColor(source?: string): string {
  switch (source) {
    case "website":      return "primary";
    case "instagram":    return "purple";
    case "facebook":     return "blue";
    case "hcp_referral": return "teal";
    case "event":        return "orange";
    default:             return "default";
  }
}
</script>
