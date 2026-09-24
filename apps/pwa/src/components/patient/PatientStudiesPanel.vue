<template>
  <div class="patient-studies-panel">
    <FormRenderer
      v-model="showAddModal"
      :fields="sleepStudyFormFields"
      title-key="app.sleepStudies.form.title"
      submit-label-key="app.sleepStudies.form.submit"
      @submit="onAddSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="sleepStudyFormFields"
      :initial-data="selectedStudy ?? undefined"
      title-key="app.sleepStudies.form.title"
      edit-title-key="app.sleepStudies.form.editTitle"
      submit-label-key="app.sleepStudies.form.submit"
      edit-submit-label-key="app.sleepStudies.form.editSubmit"
      @submit="onEditSubmit"
    />
    <ClinicalQuestionnaireDialog
      v-model="questionnaireDialog.open"
      :kind="questionnaireDialog.kind"
      :mode="questionnaireDialog.mode"
      :record="questionnaireDialog.record"
      :saving="questionnaireSaving"
      :pdf-loading="pdfLoadingId === questionnaireDialog.record?.id"
      @save="onQuestionnaireSave"
      @pdf="questionnaireDialog.record && onGeneratePdf(questionnaireDialog.record)"
    />
    <QuestionnaireQrDialog
      v-model="qrDialog.open"
      :kind="qrDialog.kind"
      :url="qrDialog.url"
      :completed="qrCompleted"
      @poll="clinical.load"
    />

    <div class="patient-studies-panel__toolbar">
      <VMenu location="bottom end">
        <template #activator="{ props: menuProps }">
          <AppButton color="primary" variant="tonal" v-bind="menuProps">
            <template #prepend><AppIcon name="plus" /></template>
            {{ t("app.clinical.addStudy") }}
          </AppButton>
        </template>
        <VList density="comfortable" class="patient-studies-panel__add-menu">
          <template v-for="entry in ADD_STUDY_MENU" :key="entry.kind">
            <template v-if="entry.patientFillable">
              <VListSubheader>{{ t(entry.labelKey) }}</VListSubheader>
              <VListItem @click="openAdd(entry.kind)">
                <template #prepend><AppIcon name="pencil" class="patient-studies-panel__menu-icon" /></template>
                <VListItemTitle>{{ t("app.clinical.fillNow") }}</VListItemTitle>
              </VListItem>
              <VListItem @click="sendToPatient(entry.kind as PatientFillableKind)">
                <template #prepend><AppIcon name="qr-code" class="patient-studies-panel__menu-icon" /></template>
                <VListItemTitle>{{ t("app.clinical.sendToPatient") }}</VListItemTitle>
              </VListItem>
            </template>
            <VListItem v-else @click="openAdd(entry.kind)">
              <VListItemTitle>{{ t(entry.labelKey) }}</VListItemTitle>
            </VListItem>
          </template>
        </VList>
      </VMenu>
    </div>

    <section v-if="clinical.pendingRequests.value.length" class="patient-studies-panel__pending" :aria-label="t('app.clinical.pending.title')">
      <h3 class="patient-studies-panel__pending-title">{{ t("app.clinical.pending.title") }}</h3>
      <div v-for="request in clinical.pendingRequests.value" :key="request.id" class="patient-studies-panel__pending-item">
        <AppIcon name="qr-code" class="patient-studies-panel__menu-icon" />
        <div class="patient-studies-panel__pending-text">
          <strong>{{ t(KIND_LABEL_KEYS[request.kind]) }}</strong>
          <span>{{ t("app.clinical.pending.expires", { time: formatDateTime(request.expires_at) }) }}</span>
        </div>
        <AppButton variant="text" size="small" @click="sendToPatient(request.kind)">{{ t("app.clinical.pending.showQr") }}</AppButton>
        <AppButton variant="text" size="small" color="error" @click="clinical.cancelRequest(request.id)">{{ t("app.clinical.pending.cancel") }}</AppButton>
      </div>
    </section>

    <AppLoadingState v-if="(loading || clinical.loading.value) && !loaded" />
    <AppErrorState
      v-else-if="loadError || clinical.loadError.value"
      :title="t('app.errorState.title')"
      :subtitle="t(loadError ? 'app.sleepStudies.errorLoad' : 'app.clinical.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadAll"
    />
    <AppEmptyState v-else-if="entries.length === 0" :title="t('app.sleepStudies.emptyTitle')" :subtitle="t('app.sleepStudies.emptySubtitle')" />
    <ul v-else class="patient-studies-panel__list">
      <template v-for="entry in entries" :key="entry.key">
        <li v-if="entry.type === 'clinical'" class="patient-studies-panel__item" @click="openRecord(entry.record)">
          <div class="patient-studies-panel__item-header">
            <span class="patient-studies-panel__date">{{ formatDate(entry.record.created_at) }}</span>
            <VChip color="primary" size="small" variant="tonal">{{ t(KIND_LABEL_KEYS[entry.record.kind]) }}</VChip>
            <VChip v-if="entry.record.source === 'patient'" color="secondary" size="small" variant="tonal">
              {{ t("app.clinical.source.patient") }}
            </VChip>
            <template v-if="entry.record.kind === 'stop_bang'">
              <VChip v-if="entry.record.score != null" :color="RISK_COLOR[stopBangRisk(entry.record.score)]" size="small" variant="tonal">
                {{ t("app.clinical.score", { score: entry.record.score }) }} · {{ t(`app.clinical.risk.${stopBangRisk(entry.record.score)}`) }}
              </VChip>
              <VChip v-else color="warning" size="small" variant="tonal">{{ t("app.clinical.awaitingBang") }}</VChip>
            </template>
          </div>
          <p v-if="entry.record.kind !== 'stop_bang'" class="patient-studies-panel__findings">{{ findingsSummary(entry.record) }}</p>
          <p v-if="entry.record.source === 'staff' && entry.record.recorded_by_name" class="patient-studies-panel__recorded-by">
            {{ t("app.clinical.recordedBy", { name: entry.record.recorded_by_name }) }}
          </p>
          <div class="patient-studies-panel__attachments">
            <AppButton
              v-if="entry.record.kind === 'stop_bang' && entry.record.score == null"
              variant="tonal"
              size="small"
              color="warning"
              @click.stop="openCompleteBang(entry.record)"
            >
              {{ t("app.clinical.completeBang") }}
            </AppButton>
            <AppButton variant="text" size="small" :loading="pdfLoadingId === entry.record.id" @click.stop="onGeneratePdf(entry.record)">
              <template #prepend><AppIcon name="file-pdf" /></template>
              {{ t("app.clinical.generatePdf") }}
            </AppButton>
          </div>
        </li>
        <li v-else class="patient-studies-panel__item" @click="onEdit(entry.study)">
          <div class="patient-studies-panel__item-header">
            <span class="patient-studies-panel__date">{{ entry.study.study_date ? formatDate(entry.study.study_date) : "—" }}</span>
            <VChip color="info" size="small" variant="tonal">{{ studyTypeLabel(entry.study.study_type) }}</VChip>
            <VChip :color="statusColor(entry.study.status)" size="small" variant="tonal">{{ statusLabel(entry.study.status) }}</VChip>
            <AppButton
              v-if="isAdmin"
              icon
              variant="text"
              size="small"
              class="patient-studies-panel__delete-btn"
              :aria-label="t('app.common.remove')"
              @click.stop="askDelete(entry.study.id)"
            >
              <AppIcon name="trash" />
            </AppButton>
          </div>
          <div class="patient-studies-panel__metrics">
            <span v-if="entry.study.ahi_score != null">AHI {{ entry.study.ahi_score }}</span>
            <span v-if="entry.study.spo2_nadir != null">SpO2 {{ entry.study.spo2_nadir }}%</span>
            <span v-if="entry.study.odi != null">ODI {{ entry.study.odi }}</span>
          </div>
          <p v-if="entry.study.interpretation" class="patient-studies-panel__interpretation">
            <strong>{{ t("app.sleepStudies.detail.interpretation") }}:</strong> {{ entry.study.interpretation }}
          </p>
          <div class="patient-studies-panel__attachments">
            <div v-for="att in attachmentsByStudy[entry.study.id] || []" :key="att.id" class="patient-studies-panel__attachment">
              <AppIcon name="file-pdf" class="patient-studies-panel__attachment-icon" />
              <button type="button" class="patient-studies-panel__attachment-name" @click.stop="onDownloadAttachment(att.id, entry.study.id)">
                {{ att.filename }}
              </button>
              <AppButton
                icon
                variant="text"
                size="small"
                :aria-label="t('app.common.remove')"
                @click.stop="onDeleteAttachment(att.id, entry.study.id)"
              >
                <AppIcon name="trash" />
              </AppButton>
            </div>
            <AppButton
              variant="text"
              size="small"
              class="patient-studies-panel__attach-btn"
              :loading="uploadingStudyId === entry.study.id"
              @click.stop="triggerUpload(entry.study.id)"
            >
              <template #prepend><AppIcon name="file-pdf" /></template>
              {{ t("app.sleepStudies.attachments.upload") }}
            </AppButton>
          </div>
        </li>
      </template>
    </ul>

    <input
      ref="fileInputEl"
      type="file"
      accept="application/pdf"
      class="patient-studies-panel__file-input"
      @click.stop
      @change="onFileChange"
    />

    <VDialog v-model="showDeleteConfirm" max-width="400" :transition="originDialogTransition">
      <VCard>
        <VCardText>{{ t("app.sleepStudies.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDeleteConfirm = false">{{ t("app.common.cancel") }}</AppButton>
          <AppButton color="error" variant="text" :loading="deleteLoading" @click="onConfirmDelete">
            {{ t("app.common.remove") }}
          </AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { defineAsyncComponent } from "vue";
import { originDialogTransition } from "@ui";
import { intlLocale } from "@i18n/language-options";
import ClinicalQuestionnaireDialog from "../questionnaire/ClinicalQuestionnaireDialog.vue";
import QuestionnaireQrDialog from "../questionnaire/QuestionnaireQrDialog.vue";
import { useClinicalRecords, type ClinicalRecord } from "../../composables/useClinicalRecords";
import {
  ADD_STUDY_MENU,
  KIND_LABEL_KEYS,
  MEDICAL_HISTORY_QUESTIONS,
  ORAL_EXAM_QUESTIONS,
  stopBangRisk,
  type ClinicalRecordKind,
  type PatientFillableKind,
} from "../../config/questionnaires";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import { apiFetch, extractErrorMessage } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { useAuthStore } from "../../stores/auth";
import { sleepStudyFormFields } from "../../config/forms/sleepStudyForm";

const FormRenderer = defineAsyncComponent(() => import("../FormRenderer.vue"));

const props = defineProps<{ patientId: string }>();

export interface SleepStudyItem {
  id: string;
  study_date: string | null;
  status: string;
  study_type: string;
  ahi_score: number | null;
  spo2_nadir: number | null;
  odi: number | null;
  interpretation: string | null;
}

interface AttachmentItem {
  id: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
}

const { t, locale } = useI18n();
const notifications = useNotifications();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const studies = ref<SleepStudyItem[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);
const showAddModal = ref(false);
const showEditModal = ref(false);
const selectedStudy = ref<SleepStudyItem | null>(null);

// Manual PDF attachment upload (2026-09) — narrow first cut: results PDF
// only, uploaded by hand. A richer flow (device/lab webhook writing
// straight into sleep_study.raw_results) is future work, not this.
const attachmentsByStudy = ref<Record<string, AttachmentItem[]>>({});
const uploadingStudyId = ref<string | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const uploadTargetStudyId = ref<string | null>(null);

async function loadAttachmentsFor(studyId: string) {
  const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments`, { handleErrors: false });
  if (res.ok) {
    const data = (await res.json()) as { items: AttachmentItem[] };
    attachmentsByStudy.value = { ...attachmentsByStudy.value, [studyId]: data.items };
  }
}

async function loadStudies() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(`/api/v1/sleep-study?patient_id=${props.patientId}&limit=-1`, { handleErrors: false });
    if (res.ok) {
      const data = (await res.json()) as { items: SleepStudyItem[] };
      studies.value = data.items;
      await Promise.all(studies.value.map((s) => loadAttachmentsFor(s.id)));
    } else {
      loadError.value = true;
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

function triggerUpload(studyId: string) {
  uploadTargetStudyId.value = studyId;
  fileInputEl.value?.click();
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const studyId = uploadTargetStudyId.value;
  input.value = ""; // reset so re-selecting the same file re-fires change
  if (!file || !studyId) return;

  if (file.type !== "application/pdf") {
    notifications.show(t("app.sleepStudies.attachments.errorType"), "error");
    return;
  }

  uploadingStudyId.value = studyId;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments`, {
      method: "POST",
      body: formData,
      handleErrors: false,
    });
    if (res.ok) {
      notifications.show(t("app.sleepStudies.attachments.uploadSuccess"), "success");
      await loadAttachmentsFor(studyId);
    } else {
      // Prefer the server's own message (e.g. "Storage not configured — set
      // SUPABASE_URL and SUPABASE_SERVICE_KEY") over the generic translated
      // fallback — handleErrors:false above means the global handler won't
      // show it, so this is the only place it surfaces.
      const bodyText = await res.text().catch(() => "");
      const serverMessage = extractErrorMessage(bodyText);
      notifications.show(serverMessage || t("app.sleepStudies.attachments.errorUpload"), "error");
    }
  } catch {
    notifications.show(t("app.sleepStudies.attachments.errorUpload"), "error");
  } finally {
    uploadingStudyId.value = null;
  }
}

async function onDownloadAttachment(attachmentId: string, studyId: string) {
  const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments/${attachmentId}/download`, { handleErrors: false });
  if (res.ok) {
    const { url } = (await res.json()) as { url: string };
    window.open(url, "_blank", "noopener");
  }
}

async function onDeleteAttachment(attachmentId: string, studyId: string) {
  if (!window.confirm(t("app.sleepStudies.attachments.deleteConfirmText"))) return;
  const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments/${attachmentId}`, {
    method: "DELETE",
    handleErrors: false,
  });
  if (res.ok) {
    attachmentsByStudy.value = {
      ...attachmentsByStudy.value,
      [studyId]: (attachmentsByStudy.value[studyId] ?? []).filter((a) => a.id !== attachmentId),
    };
  } else {
    notifications.show(t("app.sleepStudies.attachments.errorDelete"), "error");
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "interpreted": return "success";
    case "results_received":
    case "study_complete": return "info";
    case "cancelled": return "default";
    default: return "warning";
  }
}

function statusLabel(status: string): string {
  const key = `app.sleepStudies.status.${status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
  return t(key);
}

function studyTypeLabel(studyType: string): string {
  return t(`app.sleepStudies.type.${studyType.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`);
}

async function onAddSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  try {
    const res = await apiFetch("/api/v1/sleep-study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, patient_id: props.patientId }),
    });
    if (res.ok) {
      notifications.show(t("app.sleepStudies.form.success"), "success");
      await loadStudies();
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onEdit(study: SleepStudyItem) {
  selectedStudy.value = study;
  showEditModal.value = true;
}

async function onEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedStudy.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/sleep-study/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("app.sleepStudies.form.editSuccess"), "success");
      await loadStudies();
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

const showDeleteConfirm = ref(false);
const pendingDeleteId = ref<string | null>(null);

function askDelete(studyId: string) {
  pendingDeleteId.value = studyId;
  showDeleteConfirm.value = true;
}

const { loading: deleteLoading, run: onConfirmDelete } = useAsyncAction(async () => {
  const id = pendingDeleteId.value;
  if (!id) return;
  const res = await apiFetch(`/api/v1/sleep-study/${id}`, { method: "DELETE", handleErrors: false });
  if (res.ok) {
    notifications.show(t("app.sleepStudies.deleteSuccess"), "success");
    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;
    await loadStudies();
  } else {
    const bodyText = await res.text().catch(() => "");
    notifications.show(extractErrorMessage(bodyText) || t("app.sleepStudies.errorDelete"), "error");
  }
});

// ---------------------------------------------------------------------------
// Clinical questionnaires (NEO-36, migration 030) — medical history, oral
// exam, STOP-Bang live in the same Estudios list as sleep studies, each
// fill its own dated entry. Patient-fillable ones can be sent as a QR link.
// ---------------------------------------------------------------------------
const clinical = useClinicalRecords(() => props.patientId);

type Entry =
  | { type: "sleep"; key: string; date: number; study: SleepStudyItem }
  | { type: "clinical"; key: string; date: number; record: ClinicalRecord };

/** Sleep studies and questionnaires merged, newest first; undated sleep studies (not yet scheduled) sort to the top. */
const entries = computed<Entry[]>(() =>
  [
    ...studies.value.map((study): Entry => ({
      type: "sleep",
      key: `sleep-${study.id}`,
      date: study.study_date ? new Date(study.study_date).getTime() : Number.MAX_SAFE_INTEGER,
      study,
    })),
    ...clinical.records.value.map((record): Entry => ({
      type: "clinical",
      key: `${record.kind}-${record.id}`,
      date: new Date(record.created_at).getTime(),
      record,
    })),
  ].sort((a, b) => b.date - a.date)
);

const RISK_COLOR = { low: "success", intermediate: "warning", high: "error" } as const;

/** One-line clinical glance — the "yes" answers (plus skeletal class / free text), so a record needn't be opened to see what matters. */
function findingsSummary(record: ClinicalRecord): string {
  const questions = record.kind === "medical_history" ? MEDICAL_HISTORY_QUESTIONS : ORAL_EXAM_QUESTIONS;
  const positives = questions.filter((q) => record[q.key] === true).map((q) => t(q.labelKey));
  if (record.kind === "oral_exam" && record.skeletal_class) positives.push(`${t("app.clinical.skeletalClassLabel")} ${record.skeletal_class}`);
  if (record.kind === "medical_history" && record.medical_history_other) positives.push(record.medical_history_other);
  return positives.length ? t("app.clinical.positiveFindings", { list: positives.join(", ") }) : t("app.clinical.noPositiveFindings");
}

const dateLocale = computed(() => intlLocale(locale.value));
const formatDate = (value: string) => new Date(value).toLocaleDateString(dateLocale.value);
const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(dateLocale.value, { dateStyle: "short", timeStyle: "short" });

const questionnaireDialog = reactive<{
  open: boolean;
  kind: ClinicalRecordKind;
  mode: "create" | "view" | "completeBang";
  record: ClinicalRecord | null;
}>({ open: false, kind: "medical_history", mode: "create", record: null });
const questionnaireSaving = ref(false);
const pdfLoadingId = ref<string | null>(null);

function openAdd(kind: ClinicalRecordKind | "polysomnography") {
  if (kind === "polysomnography") {
    showAddModal.value = true;
    return;
  }
  Object.assign(questionnaireDialog, { open: true, kind, mode: "create", record: null });
}

function openRecord(record: ClinicalRecord) {
  Object.assign(questionnaireDialog, { open: true, kind: record.kind, mode: "view", record });
}

function openCompleteBang(record: ClinicalRecord) {
  Object.assign(questionnaireDialog, { open: true, kind: "stop_bang", mode: "completeBang", record });
}

async function onQuestionnaireSave(answers: Record<string, unknown>) {
  questionnaireSaving.value = true;
  try {
    const ok =
      questionnaireDialog.mode === "completeBang" && questionnaireDialog.record
        ? await clinical.completeBang(questionnaireDialog.record.id, answers)
        : await clinical.record(questionnaireDialog.kind, answers);
    if (ok) questionnaireDialog.open = false;
  } finally {
    questionnaireSaving.value = false;
  }
}

async function onGeneratePdf(record: ClinicalRecord) {
  pdfLoadingId.value = record.id;
  try {
    await clinical.generatePdf(record.kind, record.id);
  } finally {
    pdfLoadingId.value = null;
  }
}

const qrDialog = reactive<{ open: boolean; kind: PatientFillableKind; url: string | null; requestId: string | null }>({
  open: false,
  kind: "medical_history",
  url: null,
  requestId: null,
});
/** The request left the pending list while the QR was showing → the patient submitted it. */
const qrCompleted = computed(
  () => !!qrDialog.requestId && !clinical.pendingRequests.value.some((r) => r.id === qrDialog.requestId)
);

async function sendToPatient(kind: PatientFillableKind) {
  const created = await clinical.createRequest(kind);
  if (!created?.url) return;
  Object.assign(qrDialog, { open: true, kind, url: created.url, requestId: created.id });
}

async function loadAll() {
  await Promise.all([loadStudies(), clinical.load()]);
}

onMounted(loadAll);
watch(() => props.patientId, loadAll);
</script>

<style scoped>
.patient-studies-panel__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}


.patient-studies-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.patient-studies-panel__item {
  padding: 12px 16px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}
.patient-studies-panel__item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.patient-studies-panel__item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.patient-studies-panel__delete-btn {
  margin-left: auto;
}

.patient-studies-panel__date {
  font-weight: 600;
  font-size: 0.9375rem;
}

.patient-studies-panel__metrics {
  display: flex;
  gap: 16px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-bottom: 6px;
}

.patient-studies-panel__interpretation {
  margin: 0;
  font-size: 0.875rem;
  white-space: pre-wrap;
}

.patient-studies-panel__attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.patient-studies-panel__attachment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.patient-studies-panel__attachment-icon {
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
}

.patient-studies-panel__attachment-name {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: none;
}
.patient-studies-panel__attachment-name:hover {
  text-decoration: underline;
}

.patient-studies-panel__file-input {
  display: none;
}

.patient-studies-panel__menu-icon {
  width: 20px;
  height: 20px;
  margin-right: 12px;
  color: rgb(var(--v-theme-primary));
}

.patient-studies-panel__findings {
  margin: 0 0 4px;
  font-size: 0.875rem;
}

.patient-studies-panel__recorded-by {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-studies-panel__pending {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: var(--pwa-radius);
  border: 1px dashed rgb(var(--v-theme-secondary));
  background: rgba(var(--v-theme-secondary), 0.06);
}

.patient-studies-panel__pending-title {
  margin: 0 0 8px;
  font-size: 0.875rem;
  font-weight: 600;
}

.patient-studies-panel__pending-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  padding: 4px 0;
}

.patient-studies-panel__pending-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 160px;
  font-size: 0.875rem;
}

.patient-studies-panel__pending-text span {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
