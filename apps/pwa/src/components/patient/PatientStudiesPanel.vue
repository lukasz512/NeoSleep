<template>
  <div class="studies">
    <FormRenderer
      v-model="showSleepStudyAdd"
      :fields="sleepStudyFormFields"
      title-key="app.sleepStudies.form.title"
      submit-label-key="app.sleepStudies.form.submit"
      @submit="onSleepStudyAdd"
    />
    <FormRenderer
      v-model="showSleepStudyEdit"
      :fields="sleepStudyFormFields"
      :initial-data="editingSleepStudy ?? undefined"
      title-key="app.sleepStudies.form.title"
      edit-title-key="app.sleepStudies.form.editTitle"
      submit-label-key="app.sleepStudies.form.submit"
      edit-submit-label-key="app.sleepStudies.form.editSubmit"
      @submit="onSleepStudyEdit"
    />
    <ClinicalQuestionnaireDialog
      v-model="questionnaireDialog.open"
      :kind="questionnaireDialog.kind"
      :mode="questionnaireDialog.mode"
      :record="questionnaireDialog.record"
      :saving="saving"
      :pdf-loading="printingKey !== null"
      @save="onQuestionnaireSave"
      @pdf="onPrintRecord"
    />
    <QuestionnaireQrDialog
      v-model="qrDialog.open"
      :title="qrDialog.title"
      :url="qrDialog.url"
      :progress="qrProgress"
      :completed="qrCompleted"
      @poll="checklistApi.load"
    />
    <StudyUploadDialog
      v-model="uploadDialog.open"
      :items="items"
      :item-title="itemTitle"
      :initial-item="uploadDialog.item"
      :saving="saving"
      @submit="onUpload"
    />

    <AppLoadingState v-if="checklistApi.loading.value && !checklist" />
    <AppErrorState
      v-else-if="checklistApi.loadError.value"
      :title="t('app.errorState.title')"
      :subtitle="t('app.clinical.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="checklistApi.loading.value"
      @refresh="checklistApi.load"
    />
    <template v-else-if="checklist">
      <header class="studies__header">
        <div class="studies__progress">
          <span class="studies__progress-text">{{ t("app.clinical.progress", checklist.summary) }}</span>
          <VProgressLinear
            :model-value="(checklist.summary.done / Math.max(checklist.summary.total, 1)) * 100"
            color="success"
            bg-color="surface-variant"
            height="6"
            rounded
            :aria-label="t('app.clinical.progress', checklist.summary)"
          />
        </div>
        <div class="studies__header-actions">
          <AppButton v-if="patientCanStillDoSomething" color="primary" @click="sendEverything">
            <template #prepend><AppIcon name="qr-code" /></template>
            {{ t("app.clinical.bundleQr") }}
          </AppButton>
          <AppButton color="primary" variant="tonal" @click="openUpload(null)">
            <template #prepend><AppIcon name="upload" /></template>
            {{ t("app.clinical.addStudy") }}
          </AppButton>
        </div>
      </header>

      <section v-for="request in checklist.pending_requests" :key="request.id" class="studies__pending" :aria-label="t('app.clinical.pending.title')">
        <AppIcon name="clock" class="studies__pending-icon" />
        <div class="studies__pending-text">
          <strong>{{ t("app.clinical.pending.title") }}</strong>
          <span>
            {{ request.items.map((key) => itemTitleByKey(key)).join(" · ") }} —
            {{ t("app.clinical.qr.progress", { done: request.completed_items.length, total: request.items.length }) }} ·
            {{ t("app.clinical.pending.expires", { time: formatDateTime(request.expires_at) }) }}
          </span>
        </div>
        <AppButton variant="text" size="small" @click="resend(request.items)">{{ t("app.clinical.pending.showQr") }}</AppButton>
        <AppButton variant="text" size="small" color="error" @click="checklistApi.cancelRequest(request.id)">{{ t("app.clinical.pending.cancel") }}</AppButton>
      </section>

      <section v-for="group in groups" :key="group.key" class="studies__group" :aria-labelledby="`studies-group-${group.key}`">
        <h3 :id="`studies-group-${group.key}`" class="studies__group-title">{{ t(`app.clinical.group.${group.key}`) }}</h3>
        <ul class="studies__list">
          <li
            v-for="item in group.items"
            :key="item.key"
            :ref="(el) => setRowRef(item.key, el)"
            class="studies__item"
            :class="[`studies__item--${item.status}`, { 'studies__item--focus': focusedKey === item.key }]"
          >
            <div class="studies__item-main">
              <ChecklistStatusIcon :status="item.status" />
              <div class="studies__item-text">
                <span class="studies__item-title">{{ itemTitle(item) }}</span>
                <span class="studies__item-status">{{ statusLine(item) }}</span>
                <span v-if="latestSummary(item)" class="studies__item-summary">{{ latestSummary(item) }}</span>
              </div>
              <div class="studies__item-actions">
                <AppButton
                  v-if="item.actions.form === 'stop_bang' && item.status === 'partial'"
                  color="warning"
                  variant="tonal"
                  size="small"
                  @click="openCompleteBang(item)"
                >
                  {{ t("app.clinical.completeBang") }}
                </AppButton>
                <AppButton v-if="item.actions.qr && item.status !== 'done'" variant="text" size="small" @click="resend([item.key])">
                  <template #prepend><AppIcon name="qr-code" /></template>
                  {{ t("app.clinical.action.qr") }}
                </AppButton>
                <AppButton v-if="item.actions.fill" variant="text" size="small" @click="onFill(item)">
                  <template #prepend><AppIcon name="pencil" /></template>
                  {{ t("app.clinical.action.fill") }}
                </AppButton>
                <AppButton v-if="item.actions.print" variant="text" size="small" :loading="printingKey === item.key" @click="onPrint(item.key)">
                  <template #prepend><AppIcon name="printer" /></template>
                  {{ t("app.clinical.action.print") }}
                </AppButton>
                <AppButton v-if="item.actions.upload" variant="text" size="small" @click="openUpload(item.key)">
                  <template #prepend><AppIcon name="upload" /></template>
                  {{ t("app.clinical.action.upload") }}
                </AppButton>
              </div>
            </div>

            <template v-if="item.history.length">
              <button
                type="button"
                class="studies__history-toggle"
                :aria-expanded="expanded.has(item.key)"
                :aria-controls="`studies-history-${item.key}`"
                @click="toggle(item.key)"
              >
                <AppIcon :name="expanded.has(item.key) ? 'chevron-up' : 'chevron-down'" />
                {{ t("app.clinical.action.history", { n: item.history.length }) }}
              </button>
              <VExpandTransition>
                <ul v-show="expanded.has(item.key)" :id="`studies-history-${item.key}`" class="studies__history">
                  <li v-for="entry in item.history" :key="entry.id">
                    <button type="button" class="studies__history-entry" @click="openEntry(item, entry)">
                      <span class="studies__history-date">{{ formatDate(entry.created_at) }}</span>
                      <span>{{ entryLine(entry) }}</span>
                    </button>
                    <AppButton
                      v-if="isAdmin && entry.type === 'upload' && !entry.sleep_study_id"
                      icon
                      variant="text"
                      size="small"
                      :aria-label="t('app.common.remove')"
                      @click="checklistApi.deleteUpload(entry.id)"
                    >
                      <AppIcon name="trash" />
                    </AppButton>
                  </li>
                </ul>
              </VExpandTransition>
            </template>
          </li>
        </ul>
      </section>

      <section v-if="checklist.other_uploads.length" class="studies__group" aria-labelledby="studies-group-other">
        <h3 id="studies-group-other" class="studies__group-title">{{ t("app.clinical.group.other") }}</h3>
        <ul class="studies__list">
          <li v-for="upload in checklist.other_uploads" :key="upload.id" class="studies__item studies__item--done">
            <div class="studies__item-main">
              <ChecklistStatusIcon status="done" />
              <div class="studies__item-text">
                <span class="studies__item-title">{{ upload.title }}</span>
                <span class="studies__item-status">{{ formatDate(upload.created_at) }} · {{ upload.filename }}</span>
                <span v-if="upload.notes" class="studies__item-summary">{{ upload.notes }}</span>
              </div>
              <div class="studies__item-actions">
                <AppButton variant="text" size="small" @click="checklistApi.openFile(upload.id)">
                  <template #prepend><AppIcon name="file" /></template>
                  {{ t("app.clinical.action.open") }}
                </AppButton>
                <AppButton
                  v-if="isAdmin"
                  icon
                  variant="text"
                  size="small"
                  :aria-label="t('app.common.remove')"
                  @click="checklistApi.deleteUpload(upload.id)"
                >
                  <AppIcon name="trash" />
                </AppButton>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref, watch, type ComponentPublicInstance } from "vue";
import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import ClinicalQuestionnaireDialog from "../questionnaire/ClinicalQuestionnaireDialog.vue";
import QuestionnaireQrDialog from "../questionnaire/QuestionnaireQrDialog.vue";
import StudyUploadDialog from "../questionnaire/StudyUploadDialog.vue";
import ChecklistStatusIcon from "../questionnaire/ChecklistStatusIcon.vue";
import { apiFetch } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";
import { useAuthStore } from "../../stores/auth";
import {
  usePatientChecklist,
  type ChecklistHistoryEntry,
  type ChecklistItem,
  type ChecklistRecord,
  type ChecklistGroup,
} from "../../composables/usePatientChecklist";
import { sleepStudyFormFields } from "../../config/forms/sleepStudyForm";
import {
  MEDICAL_HISTORY_QUESTIONS,
  ORAL_EXAM_QUESTIONS,
  stopBangRisk,
  checklistItemTitle,
  type ClinicalRecordKind,
} from "../../config/questionnaires";

const FormRenderer = defineAsyncComponent(() => import("../FormRenderer.vue"));

/**
 * Estudios tab — the patient's checklist (NEO-36 part 2, ADR-024): every
 * document assigned to patients in the Documents admin, grouped consent →
 * patient → doctor → results (polysomnography always last), each with its
 * status, history and actions (QR for the patient, fill, print, upload).
 * One primary action: a single QR for everything the patient still has to
 * do. Health data — the parent only renders this for admin/doctor.
 */
const props = defineProps<{ patientId: string; focusItem?: string | null }>();

const { t, locale } = useI18n();
const notifications = useNotifications();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const checklistApi = usePatientChecklist(() => props.patientId);
const checklist = computed(() => checklistApi.checklist.value);
const items = computed(() => checklist.value?.items ?? []);

const GROUP_ORDER: ChecklistGroup[] = ["consent", "patient", "doctor", "results"];
const groups = computed(() =>
  GROUP_ORDER.map((key) => ({ key, items: items.value.filter((item) => item.group === key) })).filter((g) => g.items.length)
);
const patientCanStillDoSomething = computed(() => items.value.some((item) => item.actions.qr && item.status !== "done"));

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
const dateLocale = computed(() => intlLocale(locale.value));
const formatDate = (value: string) => new Date(value).toLocaleDateString(dateLocale.value);
const formatDateTime = (value: string) => new Date(value).toLocaleString(dateLocale.value, { dateStyle: "short", timeStyle: "short" });

/** Known items have their own translated title; documents an admin adds later fall back to their manifest label. */
function itemTitle(item: Pick<ChecklistItem, "key" | "label">): string {
  return checklistItemTitle(t, item.key, item.label);
}
function itemTitleByKey(key: string): string {
  const item = items.value.find((i) => i.key === key);
  return item ? itemTitle(item) : key;
}

function statusLine(item: ChecklistItem): string {
  const latest = item.history[0];
  if (item.status === "done" && latest) {
    const who = latest.source === "patient" ? t("app.clinical.source.patient") : latest.by ? t("app.clinical.recordedBy", { name: latest.by }) : "";
    return [t("app.clinical.status.doneOn", { date: formatDate(latest.created_at) }), who].filter(Boolean).join(" · ");
  }
  if (item.key === "polysomnography" && item.status === "partial") return t("app.clinical.status.inProgress");
  return t(`app.clinical.status.${item.status}`);
}

function findings(record: ChecklistRecord): string {
  if (record.kind === "stop_bang") {
    return record.score == null
      ? t("app.clinical.awaitingBang")
      : `${t("app.clinical.score", { score: record.score })} · ${t(`app.clinical.risk.${stopBangRisk(record.score)}`)}`;
  }
  const questions = record.kind === "medical_history" ? MEDICAL_HISTORY_QUESTIONS : ORAL_EXAM_QUESTIONS;
  const positives = questions.filter((q) => record[q.key] === true).map((q) => t(q.labelKey));
  if (record.kind === "oral_exam" && record.skeletal_class) positives.push(`${t("app.clinical.skeletalClassLabel")} ${record.skeletal_class}`);
  if (record.kind === "medical_history" && record.medical_history_other) positives.push(record.medical_history_other);
  return positives.length ? t("app.clinical.positiveFindings", { list: positives.join(", ") }) : t("app.clinical.noPositiveFindings");
}

function latestSummary(item: ChecklistItem): string | null {
  const latest = item.history[0];
  if (!latest) return null;
  if (latest.record) return findings(latest.record);
  if (latest.sleep_study) return latest.sleep_study.ahi_score != null ? `AHI ${latest.sleep_study.ahi_score}` : null;
  if (latest.type === "upload") return [latest.title, latest.notes].filter(Boolean).join(" — ");
  return null;
}

function entryLine(entry: ChecklistHistoryEntry): string {
  if (entry.record) {
    const who = entry.source === "patient" ? t("app.clinical.source.patient") : (entry.by ?? "");
    return [findings(entry.record), who].filter(Boolean).join(" · ");
  }
  if (entry.type === "consent") return t(entry.source === "patient" ? "app.clinical.history.signedByPatient" : "app.clinical.history.signed");
  if (entry.sleep_study) {
    const status = t(`app.sleepStudies.status.${entry.sleep_study.status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`);
    return [status, entry.sleep_study.ahi_score != null ? `AHI ${entry.sleep_study.ahi_score}` : null].filter(Boolean).join(" · ");
  }
  return [entry.title ?? entry.filename, entry.notes].filter(Boolean).join(" — ");
}

// ---------------------------------------------------------------------------
// History expand + deep-link focus (?item=…)
// ---------------------------------------------------------------------------
const expanded = reactive(new Set<string>());
function toggle(key: string) {
  if (expanded.has(key)) expanded.delete(key);
  else expanded.add(key);
}

const rowRefs = new Map<string, HTMLElement>();
function setRowRef(key: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) rowRefs.set(key, el);
}
const focusedKey = ref<string | null>(null);
async function highlightItem(key: string | null | undefined) {
  if (!key) return;
  await nextTick();
  rowRefs.get(key)?.scrollIntoView({ behavior: "smooth", block: "center" });
  focusedKey.value = key;
  setTimeout(() => (focusedKey.value = null), 2400);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const saving = ref(false);
const printingKey = ref<string | null>(null);

const questionnaireDialog = reactive<{
  open: boolean;
  kind: ClinicalRecordKind;
  mode: "create" | "view" | "completeBang";
  record: ChecklistRecord | null;
}>({ open: false, kind: "medical_history", mode: "create", record: null });

function onFill(item: ChecklistItem) {
  if (item.actions.fill === "sleep_study") {
    showSleepStudyAdd.value = true;
    return;
  }
  if (item.actions.form) Object.assign(questionnaireDialog, { open: true, kind: item.actions.form, mode: "create", record: null });
}

function openCompleteBang(item: ChecklistItem) {
  const record = item.history.find((h) => h.record)?.record ?? null;
  Object.assign(questionnaireDialog, { open: true, kind: "stop_bang", mode: "completeBang", record });
}

async function openEntry(item: ChecklistItem, entry: ChecklistHistoryEntry) {
  if (entry.record) {
    Object.assign(questionnaireDialog, { open: true, kind: entry.record.kind, mode: "view", record: entry.record });
  } else if (entry.sleep_study) {
    await editSleepStudy(entry.sleep_study.id);
  } else if (entry.file_attachment_id) {
    await checklistApi.openFile(entry.file_attachment_id, entry.sleep_study_id);
  } else if (item.actions.print) {
    await onPrint(item.key);
  }
}

async function onQuestionnaireSave(answers: Record<string, unknown>) {
  saving.value = true;
  try {
    const ok =
      questionnaireDialog.mode === "completeBang" && questionnaireDialog.record
        ? await checklistApi.completeBang(questionnaireDialog.record.id, answers)
        : await checklistApi.recordQuestionnaire(questionnaireDialog.kind, answers);
    if (ok) questionnaireDialog.open = false;
  } finally {
    saving.value = false;
  }
}

const PRINT_KEY_FOR_FORM: Record<ClinicalRecordKind, string> = {
  medical_history: "medicalHistory",
  oral_exam: "oralExam",
  stop_bang: "stopBang",
};

async function onPrint(key: string, recordId?: string) {
  printingKey.value = key;
  try {
    await checklistApi.print(key, recordId);
  } finally {
    printingKey.value = null;
  }
}

function onPrintRecord() {
  const record = questionnaireDialog.record;
  if (record) void onPrint(PRINT_KEY_FOR_FORM[record.kind], record.id);
}

// QR — one link for everything, or one item.
const qrDialog = reactive<{ open: boolean; title: string; url: string | null; requestId: string | null }>({
  open: false,
  title: "",
  url: null,
  requestId: null,
});
const qrRequest = computed(() => checklist.value?.pending_requests.find((r) => r.id === qrDialog.requestId) ?? null);
const qrProgress = computed(() => (qrRequest.value ? { done: qrRequest.value.completed_items.length, total: qrRequest.value.items.length } : null));
/** The link left the pending list while the QR was showing → the patient finished every step. */
const qrCompleted = computed(() => !!qrDialog.requestId && !qrRequest.value && !checklistApi.loading.value);

async function openQr(items?: string[]) {
  const created = await checklistApi.createRequest(items);
  if (!created?.url) return;
  const title =
    created.items.length === 1 ? itemTitleByKey(created.items[0]!) : created.items.map((key) => itemTitleByKey(key)).join(" · ");
  Object.assign(qrDialog, { open: true, title, url: created.url, requestId: created.id });
}
const sendEverything = () => openQr();
const resend = (keys: string[]) => openQr(keys);

// Uploads
const uploadDialog = reactive<{ open: boolean; item: string | null }>({ open: false, item: null });
function openUpload(item: string | null) {
  Object.assign(uploadDialog, { open: true, item });
}
async function onUpload(form: FormData) {
  saving.value = true;
  try {
    if (await checklistApi.upload(form)) uploadDialog.open = false;
  } finally {
    saving.value = false;
  }
}

// Sleep study (the polysomnography item) — the existing form.
const showSleepStudyAdd = ref(false);
const showSleepStudyEdit = ref(false);
const editingSleepStudy = ref<Record<string, unknown> | null>(null);

async function editSleepStudy(id: string) {
  const res = await apiFetch(`/api/v1/sleep-study/${id}`, { handleErrors: false });
  if (!res.ok) return;
  editingSleepStudy.value = (await res.json()) as Record<string, unknown>;
  showSleepStudyEdit.value = true;
}

async function onSleepStudyAdd(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const res = await apiFetch("/api/v1/sleep-study", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, patient_id: props.patientId }),
  });
  if (res.ok) {
    notifications.show(t("app.sleepStudies.form.success"), "success");
    await checklistApi.load();
  }
  done(res.ok);
}

async function onSleepStudyEdit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = editingSleepStudy.value?.id;
  if (typeof id !== "string") return done(false);
  const res = await apiFetch(`/api/v1/sleep-study/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    notifications.show(t("app.sleepStudies.form.editSuccess"), "success");
    await checklistApi.load();
  }
  done(res.ok);
}

onMounted(async () => {
  await checklistApi.load();
  await highlightItem(props.focusItem);
});
watch(() => props.patientId, () => checklistApi.load());
watch(() => props.focusItem, (key) => highlightItem(key));
</script>

<style scoped>
.studies {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.studies__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
}
.studies__progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 220px;
  max-width: 360px;
}
.studies__progress-text {
  font-weight: 600;
}
.studies__header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.studies__pending {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  padding: 10px 14px;
  border-radius: var(--pwa-radius);
  border: 1px dashed rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.07);
}
.studies__pending-icon {
  width: 22px;
  height: 22px;
  color: rgb(var(--v-theme-warning));
}
.studies__pending-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 200px;
  font-size: 0.875rem;
}

.studies__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.studies__group-title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.studies__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.studies__item {
  padding: 12px 16px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  transition: background-color 0.2s ease, box-shadow 0.3s ease;
}
/* Done = lightly highlighted, so what's still missing stands out by contrast. */
.studies__item--done {
  background: rgba(var(--v-theme-success), 0.07);
  border-color: rgba(var(--v-theme-success), 0.35);
}
.studies__item--pending_patient,
.studies__item--partial {
  border-color: rgba(var(--v-theme-warning), 0.45);
}
.studies__item--focus {
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.45);
}

.studies__item-main {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 12px;
}
.studies__item-text {
  display: flex;
  flex-direction: column;
  flex: 1 1 240px;
  min-width: 0;
}
.studies__item-title {
  font-weight: 600;
  font-size: 0.9375rem;
}
.studies__item-status {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.studies__item-summary {
  margin-top: 2px;
  font-size: 0.875rem;
}
.studies__item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-left: auto;
}
.studies__item-actions :deep(.v-btn) {
  min-height: 44px; /* touch target */
}

.studies__history-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 4px 0;
  min-height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
}
.studies__history-toggle :deep(svg) {
  width: 16px;
  height: 16px;
}
.studies__history {
  list-style: none;
  margin: 4px 0 0;
  padding: 0 0 0 36px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.studies__history li {
  display: flex;
  align-items: center;
  gap: 4px;
}
.studies__history-entry {
  display: flex;
  gap: 12px;
  flex: 1;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 0.8125rem;
  color: inherit;
}
.studies__history-entry:hover,
.studies__history-entry:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.studies__history-date {
  font-weight: 600;
  white-space: nowrap;
}
</style>
