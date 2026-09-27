<template>
  <div class="patient-aside">
    <section class="patient-aside__card" :aria-label="t('app.patients.detail.aside.keyFacts')">
      <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.keyFacts") }}</h2>
      <dl class="patient-aside__facts">
        <dt>{{ t("app.patients.detail.status") }}</dt>
        <dd>
          <VChip v-if="patient.status" :color="patientStatusColor(patient.status)" size="small" variant="tonal">
            {{ patientStatusLabel(t, patient.status) }}
          </VChip>
          <span v-else>—</span>
        </dd>
        <dt>{{ t("app.patients.detail.aside.diagnosis") }}</dt>
        <dd class="patient-aside__diagnosis">{{ diagnosis ?? "—" }}</dd>
        <dt>{{ t("app.patients.detail.ahiBaseline") }}</dt>
        <dd>{{ patient.ahi_baseline ?? "—" }}</dd>
        <dt>{{ t("app.patients.detail.cpapDevice") }}</dt>
        <dd>{{ patient.cpap_device ? t("app.common.yes") : t("app.common.no") }}</dd>
        <dt>{{ t("app.patients.detail.practitioner") }}</dt>
        <dd>
          <RouterLink
            v-if="patient.practitioner_id && patient.practitioner_name"
            class="patient-aside__link"
            :to="{ name: 'hcp-detail', params: { id: patient.practitioner_id } }"
          >
            {{ patient.practitioner_name }}
          </RouterLink>
          <span v-else>{{ patient.practitioner_name || "—" }}</span>
        </dd>
      </dl>
    </section>

    <section class="patient-aside__card patient-aside__oa" :aria-label="t('app.patients.detail.aside.orthoapnea')">
      <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.orthoapnea") }}</h2>
      <p v-if="oaError" class="patient-aside__muted">{{ t("app.patients.detail.aside.orthoapneaError") }}</p>
      <div v-else-if="latestPlan" class="patient-aside__row">
        <VChip v-if="isDraftTreatmentPlan(latestPlan)" color="warning" size="small" variant="tonal">{{ t("app.orthoApneaOrder.draftBadge") }}</VChip>
        <VChip v-else :color="treatmentPlanStatusColor(latestPlan.status)" size="small" variant="tonal">
          {{ treatmentPlanStatusLabel(t, latestPlan.status) }}
        </VChip>
        <span v-if="latestPlan.dentist_name" class="patient-aside__muted">{{ latestPlan.dentist_name }}</span>
      </div>
      <p v-else-if="oaLoaded" class="patient-aside__muted">{{ t("app.patients.detail.aside.orthoapneaNone") }}</p>
      <button type="button" class="patient-aside__all" @click="$emit('open-tab', 'orthoapnea')">
        {{ t("app.patients.detail.aside.orthoapneaOpen") }}
      </button>
    </section>

    <section v-if="canSeeStudies && checklist" class="patient-aside__card patient-aside__to-sign" :aria-label="t('app.patients.detail.aside.toSign')">
      <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.toSign") }}</h2>
      <ul v-if="toSign.length" class="patient-aside__studies">
        <li v-for="item in toSign" :key="item.key">
          <button type="button" class="patient-aside__study" @click="$emit('open-study', item.key)">
            <ChecklistStatusIcon :status="item.status" />
            <span>{{ checklistItemTitle(t, item.key, item.label) }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="patient-aside__muted">{{ t("app.patients.detail.aside.allSigned") }}</p>
    </section>

    <section v-if="canSeeStudies" class="patient-aside__card" :aria-label="t('app.clinical.summary.title')">
      <h2 class="patient-aside__heading">{{ t("app.clinical.summary.title") }}</h2>
      <p v-if="checklistApi.loadError.value" class="patient-aside__muted">{{ t("app.clinical.errorLoad") }}</p>
      <template v-else-if="checklist">
        <AppSegmentProgress :segments="checklistSegments(checklist.items)" :label="t('app.clinical.progress', checklist.summary)" />
        <ul class="patient-aside__studies">
          <li v-for="item in checklist.items" :key="item.key">
            <button type="button" class="patient-aside__study" @click="$emit('open-study', item.key)">
              <ChecklistStatusIcon :status="item.status" />
              <span>{{ checklistItemTitle(t, item.key, item.label) }}</span>
            </button>
          </li>
        </ul>
      </template>
      <!-- Hidden on the Estudios tab, whose own QR status button is right there — never two QR buttons on screen. -->
      <AppButton
        v-if="activeTab !== 'studies'"
        color="primary"
        variant="tonal"
        class="patient-aside__qr text-none"
        :disabled="!canSendQr"
        @click="$emit('qr')"
      >
        <template #prepend><AppIcon name="qr-code" /></template>
        {{ t("app.patients.detail.aside.qr") }}
      </AppButton>
    </section>

    <section class="patient-aside__card" :aria-label="t('app.patients.detail.aside.lastNote')">
      <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.lastNote") }}</h2>
      <NoteComposer
        v-model="draft"
        :placeholder="t('app.patients.detail.aside.quickNote')"
        :loading="addLoading"
        :rows="1"
        @submit="onAdd"
      />
      <p v-if="loadError" class="patient-aside__muted">{{ t("app.notes.errorLoad") }}</p>
      <p v-else-if="loaded && notes.length === 0" class="patient-aside__muted">{{ t("app.notes.empty") }}</p>
      <ul v-else-if="recent.length" class="patient-aside__notes">
        <li v-for="note in recent" :key="note.id" class="patient-aside__note">
          <div class="patient-aside__note-meta">
            <span class="patient-aside__note-author">{{ note.author_name }}</span>
            <span>{{ formatDate(note.created_at) }}</span>
          </div>
          <p class="patient-aside__note-body">{{ note.body }}</p>
        </li>
      </ul>
      <button v-if="notes.length > 0" type="button" class="patient-aside__all" @click="$emit('open-notes')">
        {{ t("app.patients.detail.aside.allNotes", { count: notes.length }) }}
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * NEO-153 side panel for PatientDetailView (ItemDetailLayout #aside, from
 * 1280px): key facts (with the profile's diagnosis), the OrthoApnea order
 * status, documents still to sign, the Estudios status with a "QR for the
 * patient" button, and the latest note with a quick-add box — what a rep needs without
 * leaving the tab they are on. Below 1280px ItemDetailLayout does not mount
 * it; the Details, Estudios and Notes tabs carry the same content. A note
 * added here reloads an open Notes tab (and vice versa) through useNotes'
 * change event. The QR itself runs in the Estudios tab (its status button
 * and polling live there), so the button asks the parent to open it.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VChip } from "vuetify/components";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppSegmentProgress from "../AppSegmentProgress.vue";
import NoteComposer from "../NoteComposer.vue";
import ChecklistStatusIcon from "../questionnaire/ChecklistStatusIcon.vue";
import { checklistSegments, usePatientChecklist } from "../../composables/usePatientChecklist";
import { checklistItemTitle } from "../../config/questionnaires";
import { apiFetch } from "../../composables/useApi";
import { formatDiagnosis } from "../../utils/diagnosis";
import { isDraftTreatmentPlan, treatmentPlanStatusColor, treatmentPlanStatusLabel } from "../../utils/treatmentPlanStatus";
import { useNotes } from "../../composables/useNotes";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { patientStatusColor, patientStatusLabel } from "../../utils/patientStatus";

const RECENT_NOTES = 1;

const props = defineProps<{
  patient: {
    id: string;
    status?: string;
    ahi_baseline?: number | null;
    cpap_device?: string | null;
    practitioner_id?: string | null;
    practitioner_name?: string | null;
    diagnosis_code?: Record<string, unknown> | null;
  };
  /** Estudios holds health data — admin, doctor and manager only (NEO-83), same rule as the tab. */
  canSeeStudies: boolean;
  /** The detail view's open tab — the Estudios status is reloaded on every switch, so it catches up with what was done there. */
  activeTab: string;
}>();

defineEmits<{
  "open-notes": [];
  "open-study": [itemKey: string];
  "open-tab": [tab: string];
  qr: [];
}>();

const { t, locale } = useI18n();

const { notes, loaded, loadError, loadNotes, addNote } = useNotes("patient", () => props.patient.id);
const recent = computed(() => notes.value.slice(0, RECENT_NOTES));

const checklistApi = usePatientChecklist(() => props.patient.id);
const checklist = computed(() => checklistApi.checklist.value);
/** Same rule as the Estudios tab's QR button: something the patient can still fill in. */
const canSendQr = computed(
  () => checklist.value?.items.some((item) => item.actions.qr && (item.status === "missing" || item.status === "pending_patient")) ?? false,
);
/** Consent-group items not yet done — the documents the patient still has to sign. Kept simple on purpose (NEO-153); a fuller e-signature list comes later. */
const toSign = computed(() => checklist.value?.items.filter((item) => item.group === "consent" && item.status !== "done") ?? []);

const diagnosis = computed(() => formatDiagnosis(props.patient.diagnosis_code));

interface LatestPlan {
  status: string;
  dentist_name: string | null;
  metadata: Record<string, unknown> | null;
}
const latestPlan = ref<LatestPlan | null>(null);
const oaLoaded = ref(false);
const oaError = ref(false);
async function loadOrthoApnea(): Promise<void> {
  oaError.value = false;
  try {
    // Newest first is the API's default order; only the latest order matters here.
    const res = await apiFetch(`/api/v1/treatment-plan?patient_id=${encodeURIComponent(props.patient.id)}&type=dental_appliance&limit=1`, {
      handleErrors: false,
    });
    if (!res.ok) {
      oaError.value = true;
      return;
    }
    const data = (await res.json()) as { items: LatestPlan[] };
    latestPlan.value = data.items[0] ?? null;
  } catch {
    oaError.value = true;
  } finally {
    oaLoaded.value = true;
  }
}

function loadStudies(): void {
  if (props.canSeeStudies) void checklistApi.load();
}

const draft = ref("");
const { loading: addLoading, run: onAdd } = useAsyncAction(async () => {
  const ok = await addNote(draft.value);
  if (ok) draft.value = "";
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(locale.value, { day: "numeric", month: "short" });
}

onMounted(() => {
  void loadNotes();
  void loadOrthoApnea();
  loadStudies();
});
watch(
  () => props.patient.id,
  () => {
    void loadNotes();
    void loadOrthoApnea();
    loadStudies();
  },
);
// Catch up with what was done in a tab (a QR answered, an order placed).
watch(
  () => props.activeTab,
  () => {
    loadStudies();
    void loadOrthoApnea();
  },
);
</script>

<style scoped>
.patient-aside {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.patient-aside__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.patient-aside__heading {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2, 8px) var(--space-3, 12px);
  align-items: center;
  margin: 0;
  font-size: 0.875rem;
}

.patient-aside__facts dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__facts dd {
  margin: 0;
  text-align: right;
}

.patient-aside__link,
.patient-aside__all {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.patient-aside__notes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.patient-aside__note {
  padding: var(--space-2, 8px) 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.patient-aside__note:first-child {
  border-top: none;
}

.patient-aside__note-meta {
  display: flex;
  gap: var(--space-2, 8px);
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__note-author {
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}

.patient-aside__note-body {
  margin: 2px 0 0;
  font-size: 0.875rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}

.patient-aside__studies {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.patient-aside__study {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  width: 100%;
  min-height: 36px;
  padding: 2px 6px;
  margin: 0 -6px;
  border: none;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}

.patient-aside__study:hover,
.patient-aside__study:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.patient-aside__qr {
  align-self: stretch;
  letter-spacing: normal;
}

.patient-aside__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.patient-aside__diagnosis {
  overflow-wrap: anywhere;
}

.patient-aside__muted {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__all {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.patient-aside__all:focus-visible,
.patient-aside__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
