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
    <!-- NEO-235: the patient QR, open as a loader from the first tap; the Documentos tab fills in the code. -->
    <QuestionnaireQrDialog v-model="qrDialog.open" :title="qrDialog.title" :url="qrDialog.url" />
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
            <!-- NEO-206: summary strip + grouped rows; the documents checklist lives in the side panel and on Documentos. -->
            <PatientDetailsTab :patient="patient" :can-see-studies="canSeeStudies" @open-tab="(tab: string) => (activeTab = tab)" />
          </template>
          <template #nextStep>
            <!-- NEO-235: below 1280px the side panel is tab 2 ("Siguiente paso", NEO-205 D1). -->
            <PatientAsidePanel
              inline
              :patient="patient"
              :can-see-studies="canSeeStudies"
              :active-tab="activeTab"
              @open-notes="activeTab = 'notes'"
              @open-study="openStudy"
              @open-tab="(tab: string) => (activeTab = tab)"
              @qr="onAsideQr"
            />
          </template>
          <template #notes>
            <PatientNotesPanel entity-type="patient" :entity-id="patient.id" />
          </template>
          <template #studies>
            <PatientChecklistPanel category="study" :patient-id="patient.id" :focus-item="studyItem" :focus-study="focusStudy" :date-of-birth="patient.date_of_birth" :gender="patient.gender" />
          </template>
          <template #orthoapnea>
            <PatientOrthoApneaPanel :patient-id="patient.id" />
          </template>
          <template #documents>
            <!-- NEO-193: consent + the Historia Clínica parts; the patient QR lives here. -->
            <PatientChecklistPanel category="document" :patient-id="patient.id" :focus-item="studyItem" :date-of-birth="patient.date_of_birth" :gender="patient.gender" :qr-request-nonce="qrRequestNonce" :hide-qr-button="asideShown" />
          </template>
          <template #history>
            <EntityHistoryPanel :endpoint="`/api/v1/patient/${patient.id}/history`" />
          </template>
        </DetailViewTabs>
      </template>
      <template v-if="patient" #aside>
        <PatientAsidePanel
          :patient="patient"
          :can-see-studies="canSeeStudies"
          :active-tab="activeTab"
          @open-notes="activeTab = 'notes'"
          @open-study="openStudy"
          @open-tab="(tab: string) => (activeTab = tab)"
          @qr="onAsideQr"
        />
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
import { ref, computed, onMounted, watch, defineAsyncComponent, provide } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { usePermissions } from "../composables/usePermissions";
import { useDetailAsideShown } from "../composables/useDetailAside";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { useEntitySubmit } from "../composables/useEntitySubmit";
import { useAsyncAction } from "../composables/useAsyncAction";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppButton from "../components/AppButton.vue";
import AppConfirmDialog from "../components/AppConfirmDialog.vue";
import AppIcon from "../components/AppIcon.vue";
import DetailViewTabs from "../components/DetailViewTabs.vue";
import { useIdentity } from "../composables/useIdentity";
import AppAvatar from "../components/AppAvatar.vue";
import IdentityDetails from "../components/IdentityDetails.vue";
import PatientNotesPanel from "../components/patient/PatientNotesPanel.vue";
import PatientAsidePanel from "../components/patient/PatientAsidePanel.vue";
import PatientChecklistPanel from "../components/patient/PatientChecklistPanel.vue";
import PatientDetailsTab from "../components/patient/PatientDetailsTab.vue";
import PatientOrthoApneaPanel from "../components/patient/PatientOrthoApneaPanel.vue";
import EntityHistoryPanel from "../components/EntityHistoryPanel.vue";
import QuestionnaireQrDialog from "../components/questionnaire/QuestionnaireQrDialog.vue";
import { PATIENT_QR_DIALOG, createQrDialogState, openQrLoader } from "../composables/usePatientQrDialog";
import { patientFormFields, patientFormDerive } from "../config/forms/patientForm";
import { STUDY_ROLES } from "../config/questionnaires";
import { CHECKLIST_TAB, type ChecklistCategory } from "../composables/usePatientChecklist";
import { useAuthStore } from "../stores/auth";
import { entityActionIcon, entityActionBtnClass } from "../config/entityActions";

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
  /** ICD-10 JSONB — nothing writes it yet; the side panel shows it when present (NEO-153). */
  diagnosis_code?: Record<string, unknown> | null;
  created_at?: string;
}

const { t } = useI18n();
const { patientDetails } = useIdentity();
const route = useRoute();
const router = useRouter();
const notifications = useNotifications();
const { submit } = useEntitySubmit();

const patient = ref<PatientDetail | null>(null);

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
  { value: "nextStep", labelKey: "app.patients.detail.tabs.nextStep", narrowOnly: true },
  { value: "notes", labelKey: "app.patients.detail.tabs.notes" },
  { value: "documents", labelKey: "app.patients.detail.tabs.documents", roles: STUDY_ROLES },
  { value: "studies", labelKey: "app.patients.detail.tabs.studies", roles: STUDY_ROLES },
  { value: "orthoapnea", labelKey: "app.patients.detail.tabs.orthoapnea" },
  { value: "history", labelKey: "app.patients.detail.tabs.history" },
];
/** Studies and Documents hold health data — admin, doctor and manager only (NEO-83); the API enforces the same. */
const userRole = computed(() => authStore.user?.role ?? "");
const canSeeStudies = computed(() => STUDY_ROLES.includes(userRole.value));
/** NEO-203: while the side panel shows (desktop), its QR is the only one — the Documentos tab drops its own. */
const asideShown = useDetailAsideShown();
/** "Next step" is a tab only where the side panel isn't shown (NEO-235). */
const patientTabs = computed(() =>
  ALL_PATIENT_TABS.filter((tab) => (!tab.roles || tab.roles.includes(userRole.value)) && !(tab.narrowOnly && asideShown.value)),
);
/** Deep-linkable via ?tab= — see SleepStudiesView/TreatmentPlansView row clicks. */
const activeTab = ref((route.query.tab as string) || "details");
// Widened past 1280px on the "Next step" tab — the panel moved beside the record, so show Details.
watch(asideShown, (shown) => {
  if (shown && activeTab.value === "nextStep") activeTab.value = "details";
});
/** Details → checklist card click: open that item in its tab (?tab=documents|studies&item=…, NEO-193). */
const studyItem = ref<string | null>((route.query.item as string) || null);
/** Estudios list row click: open that sleep study on the Estudios tab (?tab=studies&study=<id>, NEO-222). */
const focusStudy = ref<string | null>((route.query.study as string) || null);
function syncQuery() {
  const item = activeTab.value === "studies" || activeTab.value === "documents" ? studyItem.value ?? undefined : undefined;
  if (activeTab.value !== "studies") focusStudy.value = null;
  // qr is a one-shot request (NEO-221) — never left in the URL, so a reload doesn't create another link.
  router.replace({ query: { ...route.query, tab: activeTab.value, item, study: focusStudy.value ?? undefined, qr: undefined } });
}
watch(activeTab, syncQuery);
function openStudy(itemKey: string, category: ChecklistCategory) {
  studyItem.value = itemKey;
  const tab = CHECKLIST_TAB[category];
  if (activeTab.value === tab) syncQuery();
  else activeTab.value = tab;
}

/** Side panel "QR for the patient" (NEO-153): the Documentos tab owns the QR flow (status button, polling) since NEO-193, so open it there. */
const qrRequestNonce = ref(0);
/** NEO-235: one QR dialog for the record — it opens as a loader at once and the Documentos tab fills it, so nothing else shows moving. */
const qrDialog = createQrDialogState();
provide(PATIENT_QR_DIALOG, qrDialog);
function onAsideQr() {
  openQrLoader(qrDialog);
  studyItem.value = null;
  activeTab.value = CHECKLIST_TAB.document;
  qrRequestNonce.value += 1;
}
/** Patients list "Next step" QR (NEO-221) opens the record with ?qr=1 — same as pressing the side panel's QR. */
if (route.query.qr === "1" && canSeeStudies.value) {
  onAsideQr();
  syncQuery();
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
// The record never came (404 / offline): no Documentos tab to fill the QR loader, so close it.
watch(loading, (isLoading) => {
  if (!isLoading && !patient.value && !qrDialog.url) qrDialog.open = false;
});
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
