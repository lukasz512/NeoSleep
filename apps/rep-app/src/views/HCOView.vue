<template>
  <RepEntityList
    view-id="hco"
    api-endpoint="/api/hco"
    :headers="tableHeaders"
    :filter-definitions="hcoFilterDefs"
    :filter-definitions-with-options="hcoFilterDefinitions"
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
import RepEntityList from "../components/RepEntityList.vue";
import { useRepFilters, type RepFilterDefinition } from "../composables/useRepFilters";
import { useAuthStore } from "../stores/auth";

const { t } = useI18n();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const hcoFilterDefs: RepFilterDefinition[] = [
  { key: "type", labelKey: "rep.hco.filters.type", type: "select", default: "" },
  { key: "region", labelKey: "rep.hco.filters.region", type: "select", default: "" },
  { key: "status", labelKey: "rep.hco.filters.status", type: "select", default: "" },
];

const typeOptions = computed(() => [
  { title: t("rep.hco.filters.all"), value: "" },
  { title: "Clinic", value: "clinic" },
  { title: "Hospital", value: "hospital" },
  { title: "Practice", value: "practice" },
  { title: "Other", value: "other" },
]);
const regionOptions = computed(() => [
  { title: t("rep.hco.filters.all"), value: "" },
  { title: "North", value: "North" },
  { title: "Central", value: "Central" },
  { title: "South", value: "South" },
]);
const statusOptions = computed(() => [
  { title: t("rep.hco.filters.all"), value: "" },
  { title: "Active", value: "active" },
  { title: "Inactive", value: "inactive" },
  { title: "Pending", value: "pending" },
]);

const hcoFilterDefinitions = computed<RepFilterDefinition[]>(() => [
  { ...hcoFilterDefs[0], options: typeOptions.value },
  { ...hcoFilterDefs[1], options: regionOptions.value },
  { ...hcoFilterDefs[2], options: statusOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("rep.hco.table.name"), key: "name", sortable: true },
  { title: t("rep.hco.table.type"), key: "type", sortable: true },
  { title: t("rep.hco.table.region"), key: "region", sortable: true },
  { title: t("rep.hco.table.status"), key: "status", sortable: true },
]);

const hcoI18n = computed(() => ({
  searchPlaceholder: "rep.hco.searchPlaceholder",
  filtersTitle: "rep.hco.filters.title",
  filtersClear: "rep.hco.filters.clear",
  add: "rep.hco.add",
  emptyTitle: "rep.hco.emptyTitle",
  emptySubtitle: "rep.hco.emptySubtitle",
  noResultsForCriteria: "rep.hco.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "rep.hco.noResultsForCriteriaSubtitle",
  tableNoResults: "rep.hco.table.noResults",
  errorLoad: "rep.hco.errorLoad",
}));

function onAddAccount() {
  // TODO: open add-account form / modal
}
</script>
