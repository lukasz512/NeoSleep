<template>
  <div class="hcp-view">
    <LeadContactForm
      v-if="showAddModal"
      v-model="showAddModal"
      mode="contact"
      @submit="onContactSubmit"
    />
    <AppEntityList
      view-id="hcp"
      api-endpoint="/api/v1/practitioner"
      :headers="tableHeaders"
      :filter-definitions="hcpFilterDefinitions"
      :i18n="hcpI18n"
      :show-add-button="true"
      detail-route-name="hcp-detail"
      :filter-param-keys="['specialty', 'institution', 'region']"
      @add="onAddContact"
    >
    <template #item.name="{ item }">
      <span class="hcp-name-cell">
        <GenderIcon :gender="getGenderFromName((item as { name?: string }).name)" />
        {{ (item as { name?: string }).name }}
      </span>
    </template>
    <template #feed-card-title="{ item }">
      <span class="hcp-name-cell">
        <GenderIcon :gender="getGenderFromName((item as { name?: string }).name)" />
        {{ (item as { name?: string }).name }}
      </span>
    </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import GenderIcon from "../components/GenderIcon.vue";
import { type FilterDefinition } from "../composables/useFilters";
import { useConfigStore } from "../stores/config";
import { getGenderFromName } from "../utils/genderFromName";
import type { ContactFormData, LeadFormData } from "../components/LeadContactForm.vue";

const LeadContactForm = defineAsyncComponent(() => import("../components/LeadContactForm.vue"));

const { t } = useI18n();
const configStore = useConfigStore();
const showAddModal = ref(false);
const notifications = useNotifications();

const hcpFilterDefs: FilterDefinition[] = [
  { key: "specialty", labelKey: "user.hcp.filters.specialty", type: "select", default: "" },
  { key: "institution", labelKey: "user.hcp.filters.institution", type: "select", default: "" },
  { key: "region", labelKey: "user.hcp.filters.region", type: "select", default: "" },
];

const specialtyOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  ...configStore.specialtyItems,
]);
const institutionOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  ...configStore.institutionTypeItems,
]);
const regionOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const hcpFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...hcpFilterDefs[0], options: specialtyOptions.value },
  { ...hcpFilterDefs[1], options: institutionOptions.value },
  { ...hcpFilterDefs[2], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.hcp.table.name"), key: "name", sortable: true },
  { title: t("user.hcp.table.specialty"), key: "specialty", sortable: true },
  { title: t("user.hcp.table.institution"), key: "institution", sortable: true },
  { title: t("user.hcp.table.region"), key: "region", sortable: true },
]);

const hcpI18n = computed(() => ({
  searchPlaceholder: "user.hcp.searchPlaceholder",
  filtersTitle: "user.hcp.filters.title",
  filtersClear: "user.hcp.filters.clear",
  add: "user.hcp.add",
  emptyTitle: "user.hcp.emptyTitle",
  emptySubtitle: "user.hcp.emptySubtitle",
  noResultsForCriteria: "user.hcp.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.hcp.noResultsForCriteriaSubtitle",
  tableNoResults: "user.hcp.table.noResults",
  errorLoad: "user.hcp.errorLoad",
}));

function onAddContact() {
  showAddModal.value = true;
}

async function onContactSubmit(data: LeadFormData | ContactFormData) {
  // This view uses mode="contact", so the emitted payload is always ContactFormData.
  const d = data as ContactFormData;
  const body = JSON.stringify({
    name: d.name,
    email: d.email,
    phone: d.phone,
    specialty: d.specialty || undefined,
    region: d.region || undefined,
    institution: d.institution || undefined,
  });
  const res = await apiFetch("/api/v1/practitioner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "user.hcp.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.hcp.form.success"), "success");
    showAddModal.value = false;
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}
</script>

<style scoped>
.hcp-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
