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
      :show-add-button="canAdd"
      detail-route-name="patient-detail"
      :filter-param-keys="['status', 'region']"
      @add="onAddPatient"
    >
      <template #item.name="{ item }">
        <EntityLink
          :to="null"
          entity-type="patient"
          :label="(item as PatientListItem).name"
          :first-name="(item as PatientListItem).first_name"
          :last-name="(item as PatientListItem).last_name"
          :details="patientDetails(item as PatientListItem).details"
          :avatar-size="32"
        />
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar v-bind="personAvatarProps(item as PatientListItem)" entity-type="patient" :size="55" />
      </template>
      <template #feed-card-title="{ item }">
        {{ shortPersonName((item as PatientListItem).name, (item as PatientListItem).first_name, (item as PatientListItem).last_name) }}
      </template>
      <template #item.practitioner_name="{ item }">
        <EntityLink
          :to="hcpDetailLink((item as PatientListItem).practitioner_id)"
          entity-type="hcp"
          :label="(item as PatientListItem).practitioner_name"
          :first-name="(item as PatientListItem).practitioner_first_name"
          :last-name="(item as PatientListItem).practitioner_last_name"
          :details="doctorOf(item as PatientListItem).details"
          :more-details="doctorOf(item as PatientListItem).more"
          :avatar-size="32"
        />
      </template>
      <!-- Doctor's own list: every patient is theirs, so the column that
           would repeat their name shows when the record last changed. -->
      <template #item.updated_at="{ item }">
        <span class="patients-view__updated">
          <span>{{ formatDateShort((item as PatientListItem).updated_at, dateLocale) }}</span>
          <span class="patients-view__updated-ago">{{ formatRelativeToNow((item as PatientListItem).updated_at, dateLocale) }}</span>
        </span>
      </template>
      <template #item.intake_forms="{ item }">
        <PatientIntakeForms :forms="(item as PatientListItem).intake_forms ?? []" />
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
        <!-- Mobile card (NEO-57): the patient's quiet line incl. date of
             birth, then the doctor as a small identity (name only) — or, in
             the doctor's own list, when the record last changed. -->
        <span class="patients-view__card-stack">
          <IdentityDetails :details="patientDetails(item as PatientListItem, { withDob: true }).details" />
          <span v-if="isDoctor" class="patients-view__card-meta">
            {{ formatRelativeToNow((item as PatientListItem).updated_at, dateLocale) }}
          </span>
          <EntityLink
            v-else-if="(item as PatientListItem).practitioner_name"
            :to="hcpDetailLink((item as PatientListItem).practitioner_id)"
            entity-type="hcp"
            :label="(item as PatientListItem).practitioner_name"
            :first-name="(item as PatientListItem).practitioner_first_name"
            :last-name="(item as PatientListItem).practitioner_last_name"
          />
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
          <VListItem v-if="canEditPatients" :title="t('app.patients.detail.edit')" @click="onEditPatient(item as PatientListItem)">
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
import PatientIntakeForms from "../components/patient/PatientIntakeForms.vue";
import type { PatientIntakeFormStatus } from "../types/patientIntakeForm";
import EntityLink from "../components/EntityLink.vue";
import { intlLocale } from "@i18n/language-options";
import IdentityDetails from "../components/IdentityDetails.vue";
import { shortPersonName } from "../utils/shortPersonName";
import { useIdentity } from "../composables/useIdentity";
import { formatDateShort, formatRelativeToNow } from "../utils/relativeDate";
import { hcpDetailLink } from "../utils/entityLinks";
import { personAvatarProps } from "../utils/personAvatarProps";
import AppIcon from "../components/AppIcon.vue";
import AppListItemMenu from "../components/AppListItemMenu.vue";
import { entityActionIcon, entityActionMenuIconClass } from "../config/entityActions";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../composables/usePermissions";
import { useConfigStore } from "../stores/config";
import { apiFetch } from "../composables/useApi";
import { useEntitySubmit } from "../composables/useEntitySubmit";
import { patientFormFields } from "../config/forms/patientForm";
import { patientStatusColor, patientStatusLabel } from "../utils/patientStatus";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

interface PatientListItem {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  practitioner_id?: string | null;
  practitioner_name?: string | null;
  practitioner_first_name?: string | null;
  practitioner_last_name?: string | null;
  practitioner_specialty?: string | null;
  practitioner_specialties?: string[] | null;
  gender?: string | null;
  date_of_birth?: string | null;
  updated_at?: string;
  status?: string;
  region?: string;
  territory_name?: string | null;
  intake_forms?: PatientIntakeFormStatus[];
  ahi_baseline?: number | null;
  cpap_device?: string | null;
  medical_record?: string | null;
}

const { t, locale } = useI18n();
const configStore = useConfigStore();
const { patientDetails, specialtySet } = useIdentity();
const dateLocale = computed(() => intlLocale(locale.value));
function doctorOf(p: PatientListItem) {
  return specialtySet(p.practitioner_specialty, p.practitioner_specialties);
}
const { submit } = useEntitySubmit();
const authStore = useAuthStore();
// Direct add is its own, narrower admin/manager-only shortcut — everyone
// else still adds patients through the lead pipeline.
const canAdd = computed(() => authStore.user?.role === "admin" || authStore.user?.role === "manager");
const isDoctor = computed(() => authStore.user?.role === "doctor");
const { canEditPatients } = usePermissions();
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
  isDoctor.value
    ? { title: t("app.patients.table.lastUpdated"),  key: "updated_at",        sortable: true }
    : { title: t("app.patients.table.practitioner"), key: "practitioner_name", sortable: false },
  { title: t("app.patients.table.forms"),            key: "intake_forms",      sortable: false },
  { title: t("app.patients.table.status"),           key: "status",            sortable: true },
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

const statusColor = patientStatusColor;
function statusLabel(status?: string): string {
  return patientStatusLabel(t, status);
}

function onAddPatient() {
  showAddModal.value = true;
}

async function onPatientSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  await submit(
    {
      request: () =>
        apiFetch("/api/v1/patient", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      successMessage: t("app.patients.form.success"),
      errorMessage: t("app.patients.form.errorSave"),
    },
    done,
  );
}

function onEditPatient(patient: PatientListItem) {
  selectedPatient.value = patient;
  showEditModal.value = true;
}

async function onEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedPatient.value?.id;
  if (!id) { done(false); return; }
  await submit(
    {
      request: () =>
        apiFetch(`/api/v1/patient/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      successMessage: t("app.patients.form.editSuccess"),
      errorMessage: t("app.patients.form.errorSave"),
    },
    done,
  );
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
  await submit(
    {
      request: () =>
        apiFetch("/api/v1/encounter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: payload.title, start_at: payload.start_at, end_at: payload.end_at, type: payload.type, status: payload.status, location: payload.location, video_link: payload.video_link, notes: payload.notes, region: payload.region, attendees: payload.attendees }),
        }),
      successMessage: t("user.planner.form.success"),
      errorMessage: t("user.planner.form.errorSave"),
      refresh: false,
    },
    done,
  );
}
</script>

<style scoped>
.patients-view__updated {
  display: inline-flex;
  flex-direction: column;
  line-height: 1.3;
}

.patients-view__card-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.patients-view__updated-ago,
.patients-view__card-meta {
  font-size: 0.78125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
