<template>
  <div class="patients-view">
    <PatientForm
      v-if="showAddModal"
      v-model="showAddModal"
      @submit="onPatientSubmit"
    />
    <AppEntityList
      view-id="patients"
      api-endpoint="/api/v1/patient"
      :headers="tableHeaders"
      :filter-definitions="patientFilterDefinitions"
      :i18n="patientsI18n"
      :show-add-button="isAdmin"
      detail-route-name="patient-detail"
      :filter-param-keys="['status', 'region']"
      @add="onAddPatient"
    >
      <template #item.contact="{ item }">
        <span v-if="(item as { email?: string; phone?: string }).email || (item as { email?: string; phone?: string }).phone">
          {{ (item as { email?: string; phone?: string }).email || (item as { email?: string; phone?: string }).phone }}
        </span>
        <span v-else class="app-entity-list__cell-empty">—</span>
      </template>
      <template #item.practitioner_name="{ item }">
        <span v-if="(item as { practitioner_name?: string }).practitioner_name">
          {{ (item as { practitioner_name?: string }).practitioner_name }}
        </span>
        <span v-else class="app-entity-list__cell-empty">—</span>
      </template>
      <template #item.status="{ item }">
        <VChip
          :color="statusColor((item as { status?: string }).status)"
          size="small"
          variant="tonal"
        >
          {{ statusLabel((item as { status?: string }).status) }}
        </VChip>
      </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import type { PatientSubmitPayload } from "../components/PatientForm.vue";

const PatientForm = defineAsyncComponent(() => import("../components/PatientForm.vue"));

const { t } = useI18n();
const authStore = useAuthStore();
const configStore = useConfigStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");
const showAddModal = ref(false);

const patientFilterDefs: FilterDefinition[] = [
  { key: "status", labelKey: "app.patients.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "app.patients.filters.region", type: "select", default: "" },
];

const statusOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  { title: t("app.patients.filters.statusActive"),     value: "active" },
  { title: t("app.patients.filters.statusFollowUp"),   value: "follow_up" },
  { title: t("app.patients.filters.statusDischarged"), value: "discharged" },
]);

const regionOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const patientFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...patientFilterDefs[0], options: statusOptions.value },
  { ...patientFilterDefs[1], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("app.patients.table.name"),             key: "name",              sortable: true },
  { title: t("app.patients.table.contact"),          key: "contact",           sortable: false },
  { title: t("app.patients.table.practitioner"),     key: "practitioner_name", sortable: false },
  { title: t("app.patients.table.status"),           key: "status",            sortable: true },
  { title: t("app.patients.table.region"),           key: "region",            sortable: true },
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
    case "follow_up":  return "warning";
    case "discharged": return "default";
    default:           return "default";
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case "active":     return t("app.patients.filters.statusActive");
    case "follow_up":  return t("app.patients.filters.statusFollowUp");
    case "discharged": return t("app.patients.filters.statusDischarged");
    default:           return status ?? "";
  }
}

function onAddPatient() {
  showAddModal.value = true;
}

async function onPatientSubmit(data: PatientSubmitPayload) {
  const body = JSON.stringify({
    salutation:      data.salutation,
    first_name:      data.first_name,
    last_name:       data.last_name,
    email:           data.email,
    phone:           data.phone,
    practitioner_id: data.practitioner_id,
    status:          data.status,
    region:          data.region,
    ahi_baseline:    data.ahi_baseline,
    cpap_device:     data.cpap_device,
    medical_record:  data.medical_record,
  });
  const res = await apiFetch("/api/v1/patient", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "app.patients.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("app.patients.form.success"), "success");
    showAddModal.value = false;
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}
</script>
