<template>
  <AppEntityList
    view-id="hco"
    api-endpoint="/api/v1/hco"
    :headers="tableHeaders"
    :filter-definitions="hcoFilterDefinitions"
    :i18n="hcoI18n"
    :show-add-button="isAdmin"
    detail-route-name="hco-detail"
    :filter-param-keys="['type', 'region', 'status']"
    @add="onAddAccount"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";

const { t } = useI18n();
const authStore = useAuthStore();
const configStore = useConfigStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const hcoFilterDefs: FilterDefinition[] = [
  { key: "type", labelKey: "user.hco.filters.type", type: "select", default: "" },
  { key: "region", labelKey: "user.hco.filters.region", type: "select", default: "" },
  { key: "status", labelKey: "user.hco.filters.status", type: "select", default: "" },
];

const typeOptions = computed(() => [
  { title: t("user.hco.filters.all"), value: "" },
  { title: t("user.hco.filters.typeClinic"), value: "clinic" },
  { title: t("user.hco.filters.typeHospital"), value: "hospital" },
  { title: t("user.hco.filters.typePractice"), value: "practice" },
  { title: t("user.hco.filters.typeOther"), value: "other" },
]);
const regionOptions = computed(() => [
  { title: t("user.hco.filters.all"), value: "" },
  ...configStore.regionItems,
]);
const statusOptions = computed(() => [
  { title: t("user.hco.filters.all"), value: "" },
  { title: t("user.hco.filters.statusActive"), value: "active" },
  { title: t("user.hco.filters.statusInactive"), value: "inactive" },
  { title: t("user.hco.filters.statusPending"), value: "pending" },
]);

const hcoFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...hcoFilterDefs[0], options: typeOptions.value },
  { ...hcoFilterDefs[1], options: regionOptions.value },
  { ...hcoFilterDefs[2], options: statusOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.hco.table.name"), key: "name", sortable: true },
  { title: t("user.hco.table.type"), key: "type", sortable: true },
  { title: t("user.hco.table.region"), key: "region", sortable: true },
  { title: t("user.hco.table.status"), key: "status", sortable: true },
]);

const hcoI18n = computed(() => ({
  searchPlaceholder: "user.hco.searchPlaceholder",
  filtersTitle: "user.hco.filters.title",
  filtersClear: "user.hco.filters.clear",
  add: "user.hco.add",
  emptyTitle: "user.hco.emptyTitle",
  emptySubtitle: "user.hco.emptySubtitle",
  noResultsForCriteria: "user.hco.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.hco.noResultsForCriteriaSubtitle",
  tableNoResults: "user.hco.table.noResults",
  errorLoad: "user.hco.errorLoad",
}));

function onAddAccount() {
  // TODO: open add-account form / modal
}
</script>
