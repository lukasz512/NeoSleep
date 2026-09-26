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
      :date-of-birth="dateOfBirth"
      :gender="gender"
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
    <AppConfirmDialog
      v-model="deleteSleepStudy.open"
      :text="t('app.sleepStudies.deleteConfirmText')"
      :secondary-label="t('app.common.cancel')"
      :secondary-color="null"
      :primary-label="t('app.common.remove')"
      primary-color="error"
      primary-variant="text"
      :loading="deleteSleepStudy.loading"
      :persistent="false"
      max-width="400"
      @secondary="deleteSleepStudy.open = false"
      @primary="onConfirmDeleteSleepStudy"
    />

    <AppLoadingState v-if="checklistApi.loading.value && !checklist" />
    <AppErrorState
      v-else-if="checklistApi.loadError.value"
      :error="checklistApi.loadFailure.value"
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
          <!-- The QR button is also the link's status (NEO-93) — no separate "waiting" banner. -->
          <QrStatusButton
            class="studies__qr"
            :request="checklist.pending_requests[0] ?? null"
            :expired="checklist.expired_request ?? null"
            :available="patientCanStillDoSomething"
            :creating="qrCreating"
            :failed="qrFailed"
            :item-title="itemTitleByKey"
            :format-date-time="formatDateTime"
            @create="sendEverything"
            @show-again="resend"
            @cancel="checklistApi.cancelRequest"
          />
          <AppButton
            v-if="patientCanStillDoSomething"
            class="studies__compact-btn"
            color="primary"
            variant="tonal"
            :loading="emailing"
            :aria-label="t('app.clinical.email.send')"
            @click="sendByEmail"
          >
            <template #prepend><AppIcon name="mail" /></template>
            <span class="studies__btn-label">{{ t("app.clinical.email.send") }}</span>
          </AppButton>
          <AppButton class="studies__compact-btn" color="success" variant="tonal" :aria-label="t('app.clinical.addStudy')" @click="openUpload(null)">
            <template #prepend><AppIcon name="plus" class="studies__add-icon" /></template>
            <span class="studies__btn-label">{{ t("app.clinical.addStudy") }}</span>
          </AppButton>
        </div>
      </header>

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
            <span class="studies__rail"><ChecklistStatusIcon :status="item.status" /></span>
            <div class="studies__item-content">
              <div class="studies__item-main" :class="{ 'studies__item-main--result': resultEntry(item) }">
                <div class="studies__item-text">
                  <span class="studies__item-title">{{ itemTitle(item) }}</span>
                  <span class="studies__item-status">{{ statusLine(item) }}</span>
                  <!-- STOP-Bang is half the patient's, half the specialist's: show each half's own state. -->
                  <span v-if="item.actions.form === 'stop_bang' && item.status !== 'missing'" class="studies__split" :aria-label="t('app.clinical.split.aria')">
                    <span v-for="half in stopBangHalves(item)" :key="half.key" class="studies__split-half" :class="`studies__split-half--${half.state}`">
                      <AppIcon :name="half.state === 'done' ? 'check-circle' : 'clock'" class="studies__split-icon" />
                      <span>{{ half.label }}</span>
                      <small v-if="half.date">{{ half.date }}</small>
                    </span>
                  </span>
                  <span v-if="!resultEntry(item) && latestSummary(item)" class="studies__item-summary">{{ latestSummary(item) }}</span>
                </div>
                <!-- Done (or S-T-O-P in): the result replaces the buttons; the rest lives under ⋯. -->
                <div v-if="resultEntry(item)" class="studies__item-actions">
                  <AppButton
                    v-if="item.actions.form === 'stop_bang' && item.status === 'partial'"
                    color="warning"
                    variant="tonal"
                    size="small"
                    @click="openCompleteBang(item)"
                  >
                    {{ t("app.clinical.completeBang") }}
                  </AppButton>
                  <AppListItemMenu :aria-label="t('app.clinical.action.more', { item: itemTitle(item) })">
                    <VListItem :title="t('app.clinical.action.view')" @click="viewResult(item)">
                      <template #prepend><AppIcon name="eye" /></template>
                    </VListItem>
                    <VListItem v-if="item.actions.print" :title="t('app.clinical.action.print')" @click="onPrint(item.key)">
                      <template #prepend><AppIcon name="printer" /></template>
                    </VListItem>
                    <VListItem v-if="item.actions.fill" :title="t('app.clinical.action.newVersion')" @click="onFill(item)">
                      <template #prepend><AppIcon name="pencil" /></template>
                    </VListItem>
                    <VListItem v-if="item.actions.upload" :title="t('app.clinical.action.upload')" @click="openUpload(item.key)">
                      <template #prepend><AppIcon name="upload" /></template>
                    </VListItem>
                    <VListItem :title="t('app.clinical.action.history', { n: item.history.length })" @click="toggle(item.key)">
                      <template #prepend><AppIcon name="clock" /></template>
                    </VListItem>
                  </AppListItemMenu>
                </div>
                <div v-else class="studies__item-actions">
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

              <ChecklistResult
                v-if="resultEntry(item)"
                class="studies__result"
                :entry="resultEntry(item)"
                @print="onPrint(item.key)"
                @open-file="(entry) => openEntry(item, entry)"
              />

              <template v-if="item.history.length">
                <button
                  v-if="!resultEntry(item)"
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
                      <AppButton
                        v-if="entry.type === 'sleep_study' && entry.sleep_study"
                        icon
                        variant="text"
                        size="small"
                        :aria-label="t('app.common.remove')"
                        @click="askDeleteSleepStudy(entry.sleep_study.id)"
                      >
                        <AppIcon name="trash" />
                      </AppButton>
                    </li>
                  </ul>
                </VExpandTransition>
              </template>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="checklist.other_uploads.length" class="studies__group" aria-labelledby="studies-group-other">
        <h3 id="studies-group-other" class="studies__group-title">{{ t("app.clinical.group.other") }}</h3>
        <ul class="studies__list">
          <li v-for="upload in checklist.other_uploads" :key="upload.id" class="studies__item studies__item--done">
            <span class="studies__rail"><ChecklistStatusIcon status="done" /></span>
            <div class="studies__item-content">
              <div class="studies__item-main studies__item-main--result">
                <div class="studies__item-text">
                  <span class="studies__item-title">{{ upload.title }}</span>
                  <span class="studies__item-status">{{ t("app.clinical.status.doneOn", { date: formatDate(upload.created_at) }) }}<template v-if="upload.by"> · {{ t("app.clinical.recordedBy", { name: upload.by }) }}</template></span>
                </div>
                <div class="studies__item-actions">
                  <AppListItemMenu :aria-label="t('app.clinical.action.more', { item: upload.title ?? upload.filename ?? '' })">
                    <VListItem :title="t('app.clinical.action.open')" @click="checklistApi.openFile(upload.id)">
                      <template #prepend><AppIcon name="file" /></template>
                    </VListItem>
                    <VListItem v-if="isAdmin" :title="t('app.common.remove')" @click="checklistApi.deleteUpload(upload.id)">
                      <template #prepend><AppIcon name="trash" /></template>
                    </VListItem>
                  </AppListItemMenu>
                </div>
              </div>
              <ChecklistResult class="studies__result" :entry="upload" @open-file="checklistApi.openFile(upload.id)" />
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
import AppConfirmDialog from "../AppConfirmDialog.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import ClinicalQuestionnaireDialog from "../questionnaire/ClinicalQuestionnaireDialog.vue";
import QuestionnaireQrDialog from "../questionnaire/QuestionnaireQrDialog.vue";
import QrStatusButton from "../questionnaire/QrStatusButton.vue";
import StudyUploadDialog from "../questionnaire/StudyUploadDialog.vue";
import ChecklistStatusIcon from "../questionnaire/ChecklistStatusIcon.vue";
import ChecklistResult from "../questionnaire/ChecklistResult.vue";
import AppListItemMenu from "../AppListItemMenu.vue";
import { apiFetch, extractErrorMessage } from "../../composables/useApi";
import { fieldErrorsFromResponse } from "../../composables/useFormErrors";
import type { SubmitDone } from "../../composables/useEntitySubmit";
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
const props = defineProps<{
  patientId: string;
  focusItem?: string | null;
  /** From the patient record — STOP-Bang works A (age) and G (sex) out from them. */
  dateOfBirth?: string | null;
  gender?: string | null;
}>();

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
/** "partial" = the patient's part is in (STOP-Bang awaiting B-A-N-G) — mirrors the API's bundle selection. */
const patientCanStillDoSomething = computed(() => items.value.some((item) => item.actions.qr && (item.status === "missing" || item.status === "pending_patient")));

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
const dateLocale = computed(() => intlLocale(locale.value));
// Two-digit day and month everywhere (05/09/2026), the same as on the printed forms.
const formatDate = (value: string) => new Date(value).toLocaleDateString(dateLocale.value, { day: "2-digit", month: "2-digit", year: "numeric" });
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
  if (item.actions.form === "stop_bang" && item.status === "partial") {
    return item.history[0]?.source === "patient" ? t("app.clinical.split.waiting") : t("app.clinical.awaitingBang");
  }
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

/**
 * The entry whose result a row shows in place of its buttons — only once the
 * item is done, or STOP-Bang with the patient's S-T-O-P in (Łukasz,
 * 2026-09-25). null → the row keeps its actions.
 */
function resultEntry(item: ChecklistItem): ChecklistHistoryEntry | null {
  const showsResult = item.status === "done" || (item.status === "partial" && item.actions.form === "stop_bang");
  if (!showsResult) return null;
  // A structured result (answers, signature, PSG numbers) beats an attached file — the file stays in the history.
  return (
    item.history.find((e) => e.record || e.type === "consent" || e.sleep_study?.ahi_score != null) ??
    item.history.find((e) => e.type === "upload") ??
    null
  );
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

function viewResult(item: ChecklistItem) {
  const entry = resultEntry(item);
  if (entry) void openEntry(item, entry);
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

const qrCreating = ref(false);
const qrFailed = ref(false);
async function openQr(items?: string[]) {
  qrCreating.value = true;
  qrFailed.value = false;
  let created: Awaited<ReturnType<typeof checklistApi.createRequest>> = null;
  try {
    created = await checklistApi.createRequest(items);
  } finally {
    qrCreating.value = false;
  }
  qrFailed.value = !created?.url;
  if (!created?.url) return;
  const title =
    created.items.length === 1 ? itemTitleByKey(created.items[0]!) : created.items.map((key) => itemTitleByKey(key)).join(" · ");
  Object.assign(qrDialog, { open: true, title, url: created.url, requestId: created.id });
}
const sendEverything = () => openQr();

/** "Send by email": the same link as the bundle QR, emailed to the patient (all open questionnaires). */
const emailing = ref(false);
async function sendByEmail() {
  emailing.value = true;
  try {
    await checklistApi.sendByEmail();
  } finally {
    emailing.value = false;
  }
}

/** The two halves of a STOP-Bang: S-T-O-P (usually the patient's) and B-A-N-G (always the specialist's). */
function stopBangHalves(item: ChecklistItem): { key: string; label: string; state: "done" | "waiting"; date: string | null }[] {
  const latest = item.history.find((entry) => entry.type === "record")?.record;
  const stopDone = !!latest;
  const bangDone = latest?.score != null;
  const stopBy = latest?.source === "patient" ? t("app.clinical.split.patient") : t("app.clinical.split.stopStaff");
  return [
    { key: "stop", label: stopBy, state: stopDone ? "done" : "waiting", date: latest ? formatDate(latest.created_at) : null },
    { key: "bang", label: t("app.clinical.split.specialist"), state: bangDone ? "done" : "waiting", date: bangDone && latest?.updated_at ? formatDate(String(latest.updated_at)) : null },
  ];
}
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

async function onSleepStudyAdd(data: Record<string, unknown>, done: SubmitDone) {
  const res = await apiFetch("/api/v1/sleep-study", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, patient_id: props.patientId }),
  });
  if (res.ok) {
    notifications.show(t("app.sleepStudies.form.success"), "success", undefined, { icon: "nav-sleep-studies" });
    await checklistApi.load();
  }
  // A 400 naming a field is marked in the form (NEO-109); anything else was already toasted by apiFetch.
  done(res.ok, res.ok ? undefined : (await fieldErrorsFromResponse(res)) ?? undefined);
}

async function onSleepStudyEdit(data: Record<string, unknown>, done: SubmitDone) {
  const id = editingSleepStudy.value?.id;
  if (typeof id !== "string") return done(false);
  const res = await apiFetch(`/api/v1/sleep-study/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    notifications.show(t("app.sleepStudies.form.editSuccess"), "success", undefined, { icon: "nav-sleep-studies" });
    await checklistApi.load();
  }
  // A 400 naming a field is marked in the form (NEO-109); anything else was already toasted by apiFetch.
  done(res.ok, res.ok ? undefined : (await fieldErrorsFromResponse(res)) ?? undefined);
}

// Deleting a sleep study (kept from the pre-checklist panel) — from its history entry, confirmed first.
const deleteSleepStudy = reactive<{ open: boolean; id: string | null; loading: boolean }>({ open: false, id: null, loading: false });
function askDeleteSleepStudy(id: string) {
  Object.assign(deleteSleepStudy, { open: true, id });
}
async function onConfirmDeleteSleepStudy() {
  if (!deleteSleepStudy.id) return;
  deleteSleepStudy.loading = true;
  try {
    const res = await apiFetch(`/api/v1/sleep-study/${deleteSleepStudy.id}`, { method: "DELETE", handleErrors: false });
    if (res.ok) {
      notifications.show(t("app.sleepStudies.deleteSuccess"), "success", undefined, { icon: "nav-sleep-studies" });
      Object.assign(deleteSleepStudy, { open: false, id: null });
      await checklistApi.load();
    } else {
      const bodyText = await res.text().catch(() => "");
      // The confirm dialog stays open on failure — its button is the retry.
      notifications.show(extractErrorMessage(bodyText) || t("app.sleepStudies.errorDelete"), "error", undefined, { icon: "nav-sleep-studies" });
    }
  } finally {
    deleteSleepStudy.loading = false;
  }
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
  align-items: center;
  gap: 8px;
}
/* Every header button is one height — the QR status button sets the same token. */
.studies__compact-btn {
  height: var(--pwa-btn-min-height, 40px) !important;
}
.studies__add-icon {
  stroke-width: 2.6;
}
/* Phone (NEO-93): one row — the QR status takes the width, email and "add
   study" shrink to 44px round icon buttons (their aria-label keeps the name). */
@media (max-width: 600px) {
  .studies__header-actions {
    width: 100%;
    flex-wrap: nowrap;
  }
  .studies__qr {
    flex: 1 1 auto;
    min-width: 0;
  }
  .studies__compact-btn {
    flex: none;
    width: var(--pwa-btn-min-height, 44px);
    min-width: 0 !important;
    padding-inline: 0 !important;
  }
  .studies__compact-btn .studies__btn-label {
    display: none;
  }
  .studies__compact-btn :deep(.v-btn__prepend) {
    margin: 0;
  }
  /* Nothing left for the patient → no QR button: "add study" moves to the end of the row. */
  .studies__header-actions:not(:has(.studies__qr)) {
    justify-content: flex-end;
  }
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

/* Status rail (Łukasz, 2026-09-25, variant C): the left column carries the
   status icon and color; the tile itself stays neutral, so a done item reads
   at a glance without the whole list lighting up. */
.studies__item {
  display: grid;
  grid-template-columns: 44px 1fr;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
  transition: box-shadow 0.3s ease;
}
.studies__rail {
  display: grid;
  place-items: center;
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.03);
}
.studies__item--done .studies__rail {
  background: rgba(var(--v-theme-success), 0.1);
  border-right-color: rgba(var(--v-theme-success), 0.35);
}
.studies__item--pending_patient .studies__rail,
.studies__item--partial .studies__rail {
  background: rgba(var(--v-theme-warning), 0.12);
  border-right-color: rgba(var(--v-theme-warning), 0.35);
}
.studies__item--focus {
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.45);
}
.studies__item-content {
  min-width: 0;
  padding: 12px 16px;
}
.studies__result {
  margin-top: 8px;
}

.studies__item-main {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 12px;
}
/* With a result the only action is ⋯ (+ "Complete B-A-N-G"): keep it top-right, even on a phone. */
.studies__item-main--result {
  flex-wrap: nowrap;
}
.studies__item-main--result .studies__item-text {
  flex-basis: auto;
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
/* Touch target for the text buttons only, from the app-wide token (44px on
   phones). Icon buttons (the row's ⋮ menu) keep their own square size — a
   forced height on them turned the round button into an oval on desktop. */
.studies__item-actions :deep(.v-btn:not(.v-btn--icon)) {
  min-height: var(--pwa-btn-min-height, 44px);
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
  padding: 0;
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

/* STOP-Bang's two halves (patient S-T-O-P / specialist B-A-N-G), each with its own state. */
.studies__split {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.studies__split-half {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px 2px 6px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
}
.studies__split-half small {
  font-weight: 400;
  opacity: 0.8;
}
.studies__split-half--done {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}
.studies__split-half--waiting {
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-on-surface));
}
.studies__split-icon {
  width: 14px;
  height: 14px;
}
</style>
