<template>
  <div class="hcp-view">
    <LeadContactForm
      v-if="showAddModal"
      v-model="showAddModal"
      mode="contact"
      @submit="onContactSubmit"
    />
    <RepEntityList
      view-id="hcp"
      api-endpoint="/api/hcp"
      :headers="tableHeaders"
      :filter-definitions="hcpFilterDefs"
      :filter-definitions-with-options="hcpFilterDefinitions"
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
    </RepEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import RepEntityList from "../components/RepEntityList.vue";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import GenderIcon from "../components/GenderIcon.vue";
import { type RepFilterDefinition } from "../composables/useRepFilters";
import { useConfigStore } from "../stores/config";
import { getGenderFromName } from "../utils/genderFromName";

const LeadContactForm = defineAsyncComponent(() => import("../components/LeadContactForm.vue"));

const { t } = useI18n();
const configStore = useConfigStore();
const showAddModal = ref(false);
const notifications = useNotifications();

const hcpFilterDefs: RepFilterDefinition[] = [
  { key: "specialty", labelKey: "rep.hcp.filters.specialty", type: "select", default: "" },
  { key: "institution", labelKey: "rep.hcp.filters.institution", type: "select", default: "" },
  { key: "region", labelKey: "rep.hcp.filters.region", type: "select", default: "" },
];

const specialtyOptions = computed(() => [
  { title: t("rep.leads.filters.all"), value: "" },
  ...configStore.specialtyItems,
]);
const institutionOptions = computed(() => [
  { title: t("rep.leads.filters.all"), value: "" },
  ...configStore.institutionTypeItems,
]);
const regionOptions = computed(() => [
  { title: t("rep.leads.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const hcpFilterDefinitions = computed<RepFilterDefinition[]>(() => [
  { ...hcpFilterDefs[0], options: specialtyOptions.value },
  { ...hcpFilterDefs[1], options: institutionOptions.value },
  { ...hcpFilterDefs[2], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("rep.hcp.table.name"), key: "name", sortable: true },
  { title: t("rep.hcp.table.specialty"), key: "specialty", sortable: true },
  { title: t("rep.hcp.table.institution"), key: "institution", sortable: true },
  { title: t("rep.hcp.table.region"), key: "region", sortable: true },
]);

const hcpI18n = computed(() => ({
  searchPlaceholder: "rep.hcp.searchPlaceholder",
  filtersTitle: "rep.hcp.filters.title",
  filtersClear: "rep.hcp.filters.clear",
  add: "rep.hcp.add",
  emptyTitle: "rep.hcp.emptyTitle",
  emptySubtitle: "rep.hcp.emptySubtitle",
  noResultsForCriteria: "rep.hcp.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "rep.hcp.noResultsForCriteriaSubtitle",
  tableNoResults: "rep.hcp.table.noResults",
  errorLoad: "rep.hcp.errorLoad",
}));

function onAddContact() {
  showAddModal.value = true;
}

async function onContactSubmit(data: import("../components/LeadContactForm.vue").LeadFormData | import("../components/LeadContactForm.vue").ContactFormData) {
  const d = data as import("../components/LeadContactForm.vue").ContactFormData;
  const body = JSON.stringify({
    name: d.name,
    email: d.email,
    phone: d.phone,
    specialty: d.specialty || undefined,
    region: d.region || undefined,
    institution: d.institution || undefined,
  });
  const res = await apiFetch("/api/hcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "rep.hcp.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("rep.hcp.form.success"), "success");
    showAddModal.value = false;
    window.dispatchEvent(new Event("rep-entity-list-refresh"));
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
