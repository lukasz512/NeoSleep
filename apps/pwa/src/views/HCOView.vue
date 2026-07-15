<template>
  <OrganizationForm
    v-if="showAddModal"
    v-model="showAddModal"
    @submit="onAccountSubmit"
  />
  <AppEntityList
    view-id="hco"
    api-endpoint="/api/v1/organization"
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
import { computed, ref, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import type { OrganizationSubmitPayload } from "../components/OrganizationForm.vue";

const OrganizationForm = defineAsyncComponent(() => import("../components/OrganizationForm.vue"));

const { t } = useI18n();
const authStore = useAuthStore();
const configStore = useConfigStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");
const showAddModal = ref(false);

const hcoFilterDefs: FilterDefinition[] = [
  { key: "type", labelKey: "user.hco.filters.type", type: "select", default: "" },
  { key: "region", labelKey: "user.hco.filters.region", type: "select", default: "" },
  { key: "status", labelKey: "user.hco.filters.status", type: "select", default: "" },
];

// Values match the real organization_type/organization_status CHECK constraints
// (infrastructure/db/schema-snapshot.sql) — not the UI's own invented vocabulary.
const typeOptions = computed(() => [
  { title: t("user.hco.filters.all"), value: "" },
  { title: t("user.hco.filters.typeClinic"), value: "clinic" },
  { title: t("user.hco.filters.typeHospital"), value: "hospital" },
  { title: t("user.hco.filters.typePharmacy"), value: "pharmacy" },
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
  { title: t("user.hco.filters.statusPendingApproval"), value: "pending_approval" },
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
  showAddModal.value = true;
}

async function onAccountSubmit(data: OrganizationSubmitPayload) {
  const body = JSON.stringify({
    name: data.name,
    type: data.type,
    status: data.status,
    region: data.region,
    address_line1: data.address_line1,
    city: data.city,
    state: data.state,
    postal_code: data.postal_code,
    country_code: data.country_code,
    phone: data.phone,
    email: data.email,
    website: data.website,
  });
  const res = await apiFetch("/api/v1/organization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "user.hco.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.hco.form.success"), "success");
    showAddModal.value = false;
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}
</script>
