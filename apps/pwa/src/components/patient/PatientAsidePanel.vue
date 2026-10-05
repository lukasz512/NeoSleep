<template>
  <div class="patient-aside" :class="{ 'patient-aside--inline': inline }">
    <section v-if="canSeeStudies && checklist" class="patient-aside__next" :aria-label="t('app.patients.detail.aside.nextStep')">
      <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.nextStep") }}</h2>
      <p class="patient-aside__next-title">
        {{ patientItems.length ? t("app.patients.detail.aside.waitingOnPatient", { n: patientItems.length }) : t("app.patients.detail.aside.nothingForPatient") }}
      </p>
      <p v-if="patientItems.length" class="patient-aside__next-items">{{ patientItems.map((item) => checklistItemTitle(t, item.key, item.label)).join(" · ") }}</p>
      <!-- On every tab: while this panel shows, the Documentos tab drops its own QR button (NEO-203) — never two on screen. -->
      <AppButton
        color="primary"
        variant="flat"
        size="large"
        class="patient-aside__qr text-none"
        :disabled="!patientItems.length"
        @click="$emit('qr')"
      >
        <template #prepend><AppIcon name="qr-code" /></template>
        {{ patientItems.length ? t("app.patients.detail.aside.qr") : t("app.patients.detail.aside.allDone") }}
      </AppButton>
    </section>

    <p class="patient-aside__facts" :aria-label="t('app.patients.detail.aside.keyFacts')">
      <VChip v-if="patient.status" :color="patientStatusColor(patient.status)" size="small" variant="tonal">
        {{ patientStatusLabel(t, patient.status) }}
      </VChip>
      <span v-if="patient.ahi_baseline != null">{{ t("app.patients.detail.aside.ahi", { n: patient.ahi_baseline }) }}</span>
      <!-- A doctor's patient is their own: no need to read their own name here. -->
      <template v-if="isDoctor" />
      <RouterLink
        v-else-if="patient.practitioner_id && patient.practitioner_name"
        class="patient-aside__link"
        :to="{ name: 'hcp-detail', params: { id: patient.practitioner_id } }"
      >
        {{ patient.practitioner_name }}
      </RouterLink>
      <span v-else-if="patient.practitioner_name">{{ patient.practitioner_name }}</span>
      <!-- Last, so a long diagnosis is the one cut with an ellipsis; the full text is in its tooltip and on Details. -->
      <span v-if="diagnosis" class="patient-aside__diagnosis" :title="diagnosis">{{ diagnosis }}</span>
    </p>

    <section v-if="canSeeStudies" class="patient-aside__card patient-aside__docs" :aria-label="t('app.clinical.summary.title')">
      <div class="patient-aside__head">
        <h2 class="patient-aside__heading">{{ t("app.clinical.summary.title") }}</h2>
        <button v-if="(checklist?.items.length ?? 0) > DOC_ROWS" type="button" class="patient-aside__all" @click="$emit('open-tab', CHECKLIST_TAB.document)">
          {{ t("app.patients.detail.aside.allDocuments", { n: checklist?.items.length }) }}
        </button>
      </div>
      <p v-if="checklistApi.loadError.value" class="patient-aside__muted">{{ t("app.clinical.errorLoad") }}</p>
      <template v-else-if="checklist">
        <AppSegmentProgress :segments="checklistSegments(checklist.items)" :label="t('app.clinical.progress', checklist.summary)" />
        <ul class="patient-aside__studies">
          <li v-for="item in shownDocs" :key="item.key">
            <button type="button" class="patient-aside__study" @click="$emit('open-study', item.openKey, item.category)">
              <ChecklistStatusIcon :status="item.status" />
              <span>{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </template>
    </section>

    <section class="patient-aside__card patient-aside__last-note" :aria-label="t('app.patients.detail.aside.lastNote')">
      <div class="patient-aside__head">
        <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.lastNote") }}</h2>
        <button v-if="notes.length > 0" type="button" class="patient-aside__all" @click="$emit('open-notes')">
          {{ t("app.patients.detail.aside.allNotes", { count: notes.length }) }}
        </button>
      </div>
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
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * Side panel for PatientDetailView (ItemDetailLayout #aside, from 1280px),
 * NEO-153, reworked in NEO-203 to fit one screen without scrolling:
 * 1. "Next step": what the patient still has to fill in, with the big
 *    "QR for the patient" button;
 * 2. the key facts on one line;
 * 3. documents and studies, unfinished first, at most DOC_ROWS rows;
 * 4. the latest note with a quick-add box — it takes what height is left.
 * Below 1280px ItemDetailLayout does not mount it; the detail view shows it
 * as the "Next step" tab instead, right after Details (NEO-235, `inline`). A note added here reloads
 * an open Notes tab (and vice versa) through useNotes' change event. The QR
 * itself runs in the Documentos tab (its status button and polling live
 * there), so the button asks the parent to open it. The OrthoApnea card is
 * left out for now (NEO-203); the Device tab still shows the order.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VChip } from "vuetify/components";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppSegmentProgress from "../AppSegmentProgress.vue";
import NoteComposer from "../NoteComposer.vue";
import ChecklistStatusIcon from "../questionnaire/ChecklistStatusIcon.vue";
import { CHECKLIST_TAB, checklistSegments, usePatientChecklist, type ChecklistCategory, type ChecklistItem } from "../../composables/usePatientChecklist";
import { useVisiblePolling } from "../../composables/useVisiblePolling";
import { checklistItemTitle } from "../../config/questionnaires";
import { HC_PRINTABLE_KEY, splitHistoriaClinica } from "../../config/historiaClinica";
import { formatDiagnosis } from "../../utils/diagnosis";
import { useNotes } from "../../composables/useNotes";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { patientStatusColor, patientStatusLabel } from "../../utils/patientStatus";
import { usePermissions } from "../../composables/usePermissions";

const RECENT_NOTES = 1;
/** Rows the documents card shows before "See all" — what fits a 720px-tall window with the rest of the panel. */
const DOC_ROWS = 6;

const props = defineProps<{
  patient: {
    id: string;
    status?: string;
    ahi_baseline?: number | null;
    practitioner_id?: string | null;
    practitioner_name?: string | null;
    diagnosis_code?: Record<string, unknown> | null;
  };
  /** Documentos and Estudios hold health data — admin, doctor and manager only (NEO-83), same rule as the tabs. */
  canSeeStudies: boolean;
  /** The detail view's open tab — the checklist is reloaded on every switch, so it catches up with what was done there. */
  activeTab: string;
  /** Shown as the "Next step" tab below 1280px (NEO-235) — flows with the page instead of fitting the window. */
  inline?: boolean;
}>();

const { isDoctor } = usePermissions();

defineEmits<{
  "open-notes": [];
  "open-study": [itemKey: string, category: ChecklistCategory];
  "open-tab": [tab: string];
  qr: [];
}>();

const { t, locale } = useI18n();

const { notes, loaded, loadError, loadNotes, addNote } = useNotes("patient", () => props.patient.id);
const recent = computed(() => notes.value.slice(0, RECENT_NOTES));

const checklistApi = usePatientChecklist(() => props.patient.id);
const checklist = computed(() => checklistApi.checklist.value);
/** Same rule as the Documentos tab's QR button: what the patient can still fill in through the QR. */
const patientItems = computed(
  () => checklist.value?.items.filter((item) => item.actions.qr && (item.status === "missing" || item.status === "pending_patient")) ?? [],
);
/** Unfinished first (stable within each half), cut to DOC_ROWS. */
const shownDocs = computed(() => {
  const all = checklist.value?.items ?? [];
  // NEO-231 D2: the Historia clínica sections are one row, "Historia clínica · 2/4"; a click opens its first open tab.
  const { sections, rest } = splitHistoriaClinica(all);
  const rows: { key: string; label: string; status: ChecklistItem["status"]; category: ChecklistItem["category"]; openKey: string }[] = rest.map((item) => ({
    key: item.key,
    label: checklistItemTitle(t, item.key, item.label),
    status: item.status,
    category: item.category,
    openKey: item.key,
  }));
  if (sections.length) {
    const done = sections.filter((s) => s.status === "done").length;
    rows.splice(rest.findIndex((i) => i.group !== "consent") === -1 ? rows.length : rest.findIndex((i) => i.group !== "consent"), 0, {
      key: HC_PRINTABLE_KEY,
      label: `${t("app.clinical.hc.title")} · ${done}/${sections.length}`,
      status: done === sections.length ? "done" : sections.some((s) => s.status !== "missing") ? "partial" : "missing",
      category: "document",
      openKey: (sections.find((s) => s.status !== "done") ?? sections[0]!).key,
    });
  }
  return [...rows.filter((row) => row.status !== "done"), ...rows.filter((row) => row.status === "done")].slice(0, DOC_ROWS);
});

const diagnosis = computed(() => formatDiagnosis(props.patient.diagnosis_code));

function loadStudies(): void {
  if (props.canSeeStudies) void checklistApi.load();
}
// The side panel is on every tab, so it keeps its documents card current too (NEO-173) — 60 s fingerprint check.
useVisiblePolling(() => (props.canSeeStudies ? 60_000 : null), checklistApi.refreshIfChanged);

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
  loadStudies();
});
watch(
  () => props.patient.id,
  () => {
    void loadNotes();
    loadStudies();
  },
);
// Catch up with what was done in a tab (a QR answered, a document signed).
watch(() => props.activeTab, loadStudies);
</script>

<style scoped>
/* Never taller than the window (NEO-203): the note card shrinks and clips, the rest keeps its size. */
.patient-aside {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  max-height: calc(100dvh - var(--space-8, 32px));
}

.patient-aside--inline {
  max-height: none;
}

/* A tab has no fixed height to share — the facts may wrap and the note card shows in full. */
.patient-aside--inline .patient-aside__facts {
  flex-wrap: wrap;
  white-space: normal;
}

.patient-aside--inline .patient-aside__last-note {
  overflow: visible;
}

.patient-aside__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.patient-aside__next {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px);
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-primary), 0.1);
}

.patient-aside__next-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.patient-aside__next-items {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.patient-aside__qr {
  align-self: stretch;
  margin-top: var(--space-1, 4px);
  letter-spacing: normal;
}

.patient-aside__heading {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* One line, whatever the data (NEO-203): only the diagnosis shrinks. */
.patient-aside__facts {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin: 0;
  padding: 0 var(--space-1, 4px);
  font-size: 0.8125rem;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__facts > * {
  flex: none;
}

.patient-aside__facts > .patient-aside__diagnosis {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.patient-aside__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2, 8px);
}

.patient-aside__docs {
  flex: none;
}

.patient-aside__last-note {
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
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
  min-height: 0;
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
  min-height: 28px;
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

.patient-aside__muted {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__all {
  flex: none;
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
