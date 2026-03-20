<template>
  <div class="clients-view">
    <RepEntityList
      view-id="clients"
      api-endpoint="/api/clients"
      :headers="tableHeaders"
      :filter-definitions="clientFilterDefinitions"
      :i18n="clientsI18n"
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
  { key: "status",             labelKey: "app.clients.filters.status",           type: "select", default: "" },
  { key: "region",             labelKey: "app.clients.filters.region",           type: "select", default: "" },
  { key: "referred_by_source", labelKey: "app.clients.filters.referredBySource", type: "select", default: "" },
];

const statusOptions = computed(() => [
  { title: t("app.clients.filters.all"), value: "" },
  { title: t("app.clients.filters.statusActive"),     value: "active" },
  { title: t("app.clients.filters.statusFollowUp"),   value: "follow-up" },
  { title: t("app.clients.filters.statusDischarged"), value: "discharged" },
]);

const regionOptions = computed(() => [
  { title: t("app.clients.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const sourceOptions = computed(() => [
  { title: t("app.clients.filters.all"),                    value: "" },
  { title: t("app.clients.filters.sourceWebsite"),          value: "website" },
  { title: t("app.clients.filters.sourceInstagram"),        value: "instagram" },
  { title: t("app.clients.filters.sourceFacebook"),         value: "facebook" },
  { title: t("app.clients.filters.sourceHcpReferral"),      value: "hcp_referral" },
  { title: t("app.clients.filters.sourceEvent"),            value: "event" },
  { title: t("app.clients.filters.sourceOther"),            value: "other" },
]);

const clientFilterDefinitions = computed<RepFilterDefinition[]>(() => [
  { ...clientFilterDefs[0], options: statusOptions.value },
  { ...clientFilterDefs[1], options: regionOptions.value },
  { ...clientFilterDefs[2], options: sourceOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("app.clients.table.name"),             key: "name",               sortable: true },
  { title: t("app.clients.table.reason"),           key: "reason",             sortable: false },
  { title: t("app.clients.table.referredBy"),       key: "referred_by",        sortable: true },
  { title: t("app.clients.table.referredBySource"), key: "referred_by_source", sortable: true },
  { title: t("app.clients.table.status"),           key: "status",             sortable: true },
  { title: t("app.clients.table.region"),           key: "region",             sortable: true },
]);

const clientsI18n = computed(() => ({
  searchPlaceholder:            "app.clients.searchPlaceholder",
  filtersTitle:                 "app.clients.filters.title",
  filtersClear:                 "app.clients.filters.clear",
  add:                          "app.clients.add",
  emptyTitle:                   "app.clients.emptyTitle",
  emptySubtitle:                "app.clients.emptySubtitle",
  noResultsForCriteria:         "app.clients.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "app.clients.noResultsForCriteriaSubtitle",
  tableNoResults:               "app.clients.table.noResults",
  errorLoad:                    "app.clients.errorLoad",
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
  website:      "app.clients.filters.sourceWebsite",
  instagram:    "app.clients.filters.sourceInstagram",
  facebook:     "app.clients.filters.sourceFacebook",
  hcp_referral: "app.clients.filters.sourceHcpReferral",
  event:        "app.clients.filters.sourceEvent",
  other:        "app.clients.filters.sourceOther",
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
