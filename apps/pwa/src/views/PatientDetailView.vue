<template>
  <div class="view-detail">
    <FormRenderer
      v-model="showEditModal"
      :fields="patientFormFields"
      :derive="patientFormDerive"
      :initial-data="patient ?? undefined"
      title-key="app.patients.form.title"
      edit-title-key="app.patients.form.editTitle"
      submit-label-key="app.patients.form.submit"
      edit-submit-label-key="app.patients.form.editSubmit"
      avatar-entity-type="patient"
      @submit="onPatientSubmit"
    />
    <AppointmentDialog
      v-model="showAppointmentDialog"
      :patient="appointmentPatient"
    />
    <ItemDetailLayout
      :has-content="!!patient"
      :loading="loading"
      :load-error="loadFailed"
      :load-error-cause="loadFailure"
      :back-route="{ name: 'patients' }"
      :back-label="t('app.patients.detail.back')"
      :record-title="patient?.name ?? ''"
      :not-found-label="t('app.patients.detail.notFound')"
      @retry="loadPatient"
    >
      <template v-if="patient" #record-tile>
        <AppAvatar :name="patient.name" entity-type="patient" :first-name="patient.first_name" :last-name="patient.last_name" :size="48" />
      </template>
      <template v-if="patient" #record-details>
        <IdentityDetails :details="patientDetails(patient, { long: true }).details" />
      </template>
      <template v-if="patient" #header-actions>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('bookAppointment')"
              :aria-label="t('user.detail.bookAppointment')"
              data-testid="patient-book-appointment"
              @click="onBookAppointment"
            >
              <AppIcon :name="entityActionIcon('bookAppointment')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.detail.bookAppointment') }}</span>
        </VTooltip>
        <VTooltip v-if="canEditPatients" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('edit')"
              :aria-label="t('app.patients.detail.edit')"
              @click="onEdit"
            >
              <AppIcon :name="entityActionIcon('edit')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('app.patients.detail.edit') }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('delete')"
              :aria-label="t('app.patients.actions.delete')"
              @click="showDeleteConfirm = true"
            >
              <AppIcon :name="entityActionIcon('delete')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('app.patients.actions.delete') }}</span>
        </VTooltip>
      </template>
      <template v-if="patient" #sections>
        <DetailViewTabs v-model="activeTab" :tabs="patientTabs">
          <template #details>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.email") }}</dt>
              <dd class="view-item__value">
                <a v-if="patient.email" :href="`mailto:${patient.email}`" class="view-item__link">{{ patient.email }}</a>
                <span v-else class="view-item__empty">—</span>
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.phone") }}</dt>
              <dd class="view-item__value">
                <a v-if="patient.phone" :href="`tel:${patient.phone}`" class="view-item__link">{{ patient.phone }}</a>
                <span v-else class="view-item__empty">—</span>
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.practitioner") }}</dt>
              <dd class="view-item__value">
                <EntityLink
                  :to="patient.practitioner_id ? { name: 'hcp-detail', params: { id: patient.practitioner_id } } : null"
                  :label="patient.practitioner_name"
                  entity-type="hcp"
                  :specialty="patient.practitioner_specialty"
                  :details="specialtySet(patient.practitioner_specialty, patient.practitioner_specialties).details"
                  :more-details="specialtySet(patient.practitioner_specialty, patient.practitioner_specialties).more"
                  :avatar-size="32"
                />
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.status") }}</dt>
              <dd class="view-item__value">
                <VChip :color="patientStatusColor(patient.status)" size="small" variant="tonal">
                  {{ patientStatusLabel(t, patient.status) }}
                </VChip>
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.region") }}</dt>
              <dd class="view-item__value">{{ regionBreadcrumb }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.ahiBaseline") }}</dt>
              <dd class="view-item__value">{{ patient.ahi_baseline ?? "—" }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.cpapDevice") }}</dt>
              <dd class="view-item__value">{{ patient.cpap_device ? t("app.common.yes") : t("app.common.no") }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("app.patients.detail.medicalRecord") }}</dt>
              <dd class="view-item__value">{{ patient.medical_record || "—" }}</dd>
            </div>
            <PatientStudiesSummary v-if="canSeeStudies" :patient-id="patient.id" @open="openStudy" />
          </template>
          <template #notes>
            <PatientNotesPanel entity-type="patient" :entity-id="patient.id" />
          </template>
          <template #studies>
            <PatientStudiesPanel :patient-id="patient.id" :focus-item="studyItem" />
          </template>
          <template #orthoapnea>
            <PatientOrthoApneaPanel :patient-id="patient.id" />
          </template>
          <template #documents>
            <EntityDocumentsPanel :endpoint="`/api/v1/patient/${patient.id}/documents`" />
          </template>
          <template #history>
            <EntityHistoryPanel :endpoint="`/api/v1/patient/${patient.id}/history`" />
          </template>
        </DetailViewTabs>
      </template>
    </ItemDetailLayout>

    <AppConfirmDialog
      v-model="showDeleteConfirm"
      :text="t('app.patients.actions.deleteConfirmText')"
      :secondary-label="t('app.common.cancel')"
      :secondary-color="null"
      :primary-label="t('app.patients.actions.delete')"
      primary-color="error"
      primary-variant="text"
      :loading="deleteLoading"
      max-width="360"
      @secondary="showDeleteConfirm = false"
      @primary="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { usePermissions } from "../composables/usePermissions";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { useEntitySubmit } from "../composables/useEntitySubmit";
import { useAsyncAction } from "../composables/useAsyncAction";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppButton from "../components/AppButton.vue";
import AppConfirmDialog from "../components/AppConfirmDialog.vue";
import AppIcon from "../components/AppIcon.vue";
import DetailViewTabs from "../components/DetailViewTabs.vue";
import EntityLink from "../components/EntityLink.vue";
import { useIdentity } from "../composables/useIdentity";
import AppAvatar from "../components/AppAvatar.vue";
import IdentityDetails from "../components/IdentityDetails.vue";
import PatientNotesPanel from "../components/patient/PatientNotesPanel.vue";
import PatientStudiesPanel from "../components/patient/PatientStudiesPanel.vue";
import PatientStudiesSummary from "../components/patient/PatientStudiesSummary.vue";
import PatientOrthoApneaPanel from "../components/patient/PatientOrthoApneaPanel.vue";
import EntityHistoryPanel from "../components/EntityHistoryPanel.vue";
import EntityDocumentsPanel from "../components/EntityDocumentsPanel.vue";
import { patientFormFields, patientFormDerive } from "../config/forms/patientForm";
import { STUDY_ROLES } from "../config/questionnaires";
import { useAuthStore } from "../stores/auth";
import { entityActionIcon, entityActionBtnClass } from "../config/entityActions";
import { patientStatusColor, patientStatusLabel } from "../utils/patientStatus";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
const AppointmentDialog = defineAsyncComponent(() => import("../components/AppointmentDialog.vue"));

const { canEditPatients, isAdmin } = usePermissions();
const authStore = useAuthStore();

interface PatientDetail {
  id: string;
  name: string;
  salutation?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  practitioner_id?: string | null;
  practitioner_name?: string | null;
  practitioner_specialty?: string | null;
  practitioner_specialties?: string[] | null;
  gender?: string | null;
  date_of_birth?: string | null;
  status?: string;
  region?: string;
  territory_id?: string | null;
  /** Root-first ancestor chain ("mx" → "cdmx" → "polanco") — null until a
   *  territory is assigned, or if territory_id points at a since-deleted
   *  node (see GetPatientByIdQuery in queries/patient.ts). */
  territory_path?: { id: string; name: string; code: string | null; kind: string }[] | null;
  ahi_baseline?: number | null;
  cpap_device?: string | null;
  medical_record?: string | null;
}

const { t } = useI18n();
const { patientDetails, specialtySet } = useIdentity();
const route = useRoute();
const router = useRouter();
const notifications = useNotifications();
const { submit } = useEntitySubmit();

const patient = ref<PatientDetail | null>(null);


/** territory_path (when set) as "mx/cdmx/polanco" — each ancestor's own short
 *  `code`, root-first, lowercased. Falls back to the flat identities.region
 *  text for patients with no territory assigned yet (the common case until
 *  this gets populated — see PatientDetailView's Region row). */
const regionBreadcrumb = computed(() => {
  const path = patient.value?.territory_path;
  if (path && path.length > 0) {
    return path.map((node) => (node.code || node.name).toLowerCase()).join("/");
  }
  return patient.value?.region || "—";
});

const loading = ref(true);
/** True when loadPatient() failed for a reason other than a genuine 404 (network/server) — see loadPatient(). */
const loadFailed = ref(false);
/** The error behind loadFailed (NEO-81) — lets the error state say offline vs. server problem. */
const loadFailure = ref<unknown>(null);
const showEditModal = ref(false);
const showAppointmentDialog = ref(false);
/** "Umów wizytę" books a patient↔doctor appointment (NEO-34), with the patient's assigned doctor pre-selected. */
const appointmentPatient = computed(() =>
  patient.value ? { id: patient.value.id, name: patient.value.name, practitioner_id: patient.value.practitioner_id ?? null } : null,
);
const showDeleteConfirm = ref(false);

const ALL_PATIENT_TABS = [
  { value: "details", labelKey: "app.patients.detail.tabs.details" },
  { value: "notes", labelKey: "app.patients.detail.tabs.notes" },
  { value: "studies", labelKey: "app.patients.detail.tabs.studies", roles: STUDY_ROLES },
  { value: "orthoapnea", labelKey: "app.patients.detail.tabs.orthoapnea" },
  { value: "documents", labelKey: "app.patients.detail.tabs.documents", roles: STUDY_ROLES },
  { value: "history", labelKey: "app.patients.detail.tabs.history" },
];
/** Studies and Documents hold health data — admin, doctor and manager only (NEO-83); the API enforces the same. */
const userRole = computed(() => authStore.user?.role ?? "");
const canSeeStudies = computed(() => STUDY_ROLES.includes(userRole.value));
const patientTabs = computed(() => ALL_PATIENT_TABS.filter((tab) => !tab.roles || tab.roles.includes(userRole.value)));
/** Deep-linkable via ?tab= — see SleepStudiesView/TreatmentPlansView row clicks. */
const activeTab = ref((route.query.tab as string) || "details");
/** Details → Estudios card click: open that item in the Estudios tab (?tab=studies&item=…). */
const studyItem = ref<string | null>((route.query.item as string) || null);
function syncQuery() {
  const item = activeTab.value === "studies" ? studyItem.value ?? undefined : undefined;
  router.replace({ query: { ...route.query, tab: activeTab.value, item } });
}
watch(activeTab, syncQuery);
function openStudy(itemKey: string) {
  studyItem.value = itemKey;
  if (activeTab.value === "studies") syncQuery();
  else activeTab.value = "studies";
}

function onEdit() {
  showEditModal.value = true;
}

function onBookAppointment() {
  showAppointmentDialog.value = true;
}

async function onPatientSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = patient.value?.id;
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
      icon: "nav-patients",
      context: patient.value?.name,
      errorMessage: t("app.patients.form.errorSave"),
      onSuccess: () => loadPatient(),
    },
    done,
  );
}

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = patient.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/patient/${id}`, {
    method: "DELETE",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("app.patients.actions.deleteSuccess"), "success", undefined, { icon: "nav-patients", context: patient.value?.name });
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "patients" });
  }
});

async function loadPatient() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  patient.value = null;
  loadFailed.value = false;
  try {
    const res = await apiFetch(`/api/v1/patient/${id}`, { handleErrors: false });
    if (res.ok) {
      patient.value = (await res.json()) as PatientDetail;
    } else if (res.status !== 404) {
      // Not a genuine 404 — ItemDetailLayout renders its own "connection
      // problem" + retry state for this (see :load-error), so no separate
      // toast on top of it.
      loadFailure.value = await reportFailedResponse(res, { where: "PatientDetailView.load", path: "/api/v1/patient/:id" });
      loadFailed.value = true;
    }
  } catch (err) {
    reportCaught(err, { where: "PatientDetailView.load" });
    loadFailure.value = err;
    loadFailed.value = true;
    patient.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadPatient);
watch(() => route.params.id, loadPatient);
</script>

<style scoped>
.view-item__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Extra room below the name — with the tab bar sitting directly under it
     (unlike other detail views, which go straight into rows), the default
     20px from .view-item__title read as cramped, especially for a long
     name that wraps to two lines. */
  margin-bottom: 12px;
}
</style>
