<template>
  <div class="patients-view">
    <FormRenderer
      v-model="showAddModal"
      :fields="patientFormFields"
      title-key="app.patients.form.title"
      submit-label-key="app.patients.form.submit"
      avatar-entity-type="patient"
      @submit="onPatientSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="patientFormFields"
      :initial-data="selectedPatient ?? undefined"
      title-key="app.patients.form.title"
      edit-title-key="app.patients.form.editTitle"
      submit-label-key="app.patients.form.submit"
      edit-submit-label-key="app.patients.form.editSubmit"
      avatar-entity-type="patient"
      @submit="onEditSubmit"
    />
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <AppEntityList
      view-id="patients"
      api-endpoint="/api/v1/patient"
      :cacheable="false"
      :headers="tableHeaders"
      :filter-definitions="patientFilterDefinitions"
      :i18n="patientsI18n"
      :show-add-button="isAdmin"
      detail-route-name="patient-detail"
      :filter-param-keys="['status', 'region']"
      @add="onAddPatient"
    >
      <template #item.name="{ item }">
        <span class="patients-name-cell">
          <AppAvatar :name="(item as { name?: string }).name" entity-type="patient" :size="32" />
          {{ (item as { name?: string }).name }}
        </span>
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar :name="(item as { name?: string }).name" entity-type="patient" :size="55" />
      </template>
      <template #feed-card-title="{ item }">
        {{ (item as { name?: string }).name }}
      </template>
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
      <template #feed-card-meta="{ item }">
        <span v-if="(item as { practitioner_name?: string }).practitioner_name">
          {{ (item as { practitioner_name?: string }).practitioner_name }}
        </span>
      </template>
      <template #feed-card-status="{ item }">
        <VChip
          :color="statusColor((item as { status?: string }).status)"
          size="x-small"
          variant="tonal"
        >
          {{ statusLabel((item as { status?: string }).status) }}
        </VChip>
      </template>
      <template #feed-card-actions="{ item }">
        <AppListItemMenu :aria-label="t('app.common.moreActions')">
          <VListItem :title="t('user.detail.scheduleVisit')" @click="onScheduleVisit(item as PatientListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('scheduleVisit')" :class="entityActionMenuIconClass('scheduleVisit')" /></template>
          </VListItem>
          <VListItem v-if="isAdmin" :title="t('app.patients.detail.edit')" @click="onEditPatient(item as PatientListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('edit')" :class="entityActionMenuIconClass('edit')" /></template>
          </VListItem>
        </AppListItemMenu>
      </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import AppAvatar from "../components/AppAvatar.vue";
import AppIcon from "../components/AppIcon.vue";
import AppListItemMenu from "../components/AppListItemMenu.vue";
import { entityActionIcon, entityActionMenuIconClass } from "../config/entityActions";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { apiFetch } from "../composables/useBffApi";
import { useNotifications } from "../composables/useNotifications";
import { patientFormFields } from "../config/forms/patientForm";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

interface PatientListItem {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  practitioner_id?: string | null;
  practitioner_name?: string | null;
  status?: string;
  region?: string;
  ahi_baseline?: number | null;
  cpap_device?: string | null;
  medical_record?: string | null;
}

const { t } = useI18n();
const authStore = useAuthStore();
const configStore = useConfigStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");
const showAddModal = ref(false);
const showEditModal = ref(false);
const showEventForm = ref(false);
const selectedPatient = ref<PatientListItem | null>(null);
const eventFormInitial = ref<{ start_at: string; end_at: string; patientIds?: string[] } | undefined>(undefined);

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

async function onPatientSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  try {
    const res = await apiFetch("/api/v1/patient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("app.patients.form.success"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onEditPatient(patient: PatientListItem) {
  selectedPatient.value = patient;
  showEditModal.value = true;
}

async function onEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedPatient.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/patient/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("app.patients.form.editSuccess"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onScheduleVisit(patient: PatientListItem) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  eventFormInitial.value = {
    start_at: new Date(`${date} 09:00`).toISOString(),
    end_at: new Date(`${date} 10:00`).toISOString(),
    patientIds: patient.id ? [patient.id] : [],
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(
  payload: import("../components/EventForm.vue").EventSubmitPayload,
  done: (ok: boolean) => void,
) {
  try {
    const res = await apiFetch("/api/v1/encounter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: payload.title, start_at: payload.start_at, end_at: payload.end_at, type: payload.type, status: payload.status, location: payload.location, video_link: payload.video_link, notes: payload.notes, region: payload.region, attendees: payload.attendees }),
    });
    if (res.ok) {
      notifications.show(t("user.planner.form.success"), "success");
      done(true);
    } else {
      notifications.show(t("user.planner.form.errorSave"), "error");
      done(false);
    }
  } catch {
    notifications.show(t("user.planner.form.errorSave"), "error");
    done(false);
  }
}
</script>

<style scoped>
.patients-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

</style>
