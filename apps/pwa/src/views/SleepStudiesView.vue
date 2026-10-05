<template>
  <div class="sleep-studies-view">
    <AppEntityList
      view-id="sleep-studies"
      api-endpoint="/api/v1/sleep-study"
      :cacheable="false"
      :headers="tableHeaders"
      :filter-definitions="filterDefinitions"
      :i18n="listI18n"
      :queues="queues"
      detail-route-name="patient-detail"
      detail-route-param="patient_id"
      :detail-route-query="sleepStudyDetailQuery"
      :filter-param-keys="['status']"
    >
      <template #item.patient_name="{ item }">
        <EntityLink
          :to="null"
          entity-type="patient"
          :label="(item as SleepStudyRow).patient_name"
          :first-name="(item as SleepStudyRow).patient_first_name"
          :last-name="(item as SleepStudyRow).patient_last_name"
          :avatar-size="32"
        />
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar :name="(item as SleepStudyRow).patient_name" entity-type="patient" :size="55" />
      </template>
      <template #feed-card-title="{ item }">
        {{ shortPersonName((item as SleepStudyRow).patient_name, (item as SleepStudyRow).patient_first_name, (item as SleepStudyRow).patient_last_name) || "—" }}
      </template>
      <template #item.study="{ item }">
        <div>{{ phaseLabel(item as SleepStudyRow) }}</div>
        <div class="sleep-studies-view__sub">{{ studySub(item as SleepStudyRow) }}</div>
      </template>
      <template #item.result="{ item }">
        <StudyResultCell :study="item as SleepStudyRow" />
      </template>
      <template #item.next_step="{ item }">
        <div class="sleep-studies-view__step" :class="{ 'sleep-studies-view__step--attention': isStudyAttention(stepOf(item)) }">
          {{ t(studyStepKey(stepOf(item))) }}
        </div>
        <div v-if="stepSince(item as SleepStudyRow)" class="sleep-studies-view__sub">{{ stepSince(item as SleepStudyRow) }}</div>
      </template>
      <!-- Phone card: the name keeps the full width; phase/AHI and the next step stack under it. -->
      <template #feed-card-meta="{ item }">
        <div>{{ cardMeta(item as SleepStudyRow) }}</div>
        <div class="sleep-studies-view__card-step" :class="{ 'sleep-studies-view__step--attention': isStudyAttention(stepOf(item)) }">
          {{ t(studyStepKey(stepOf(item))) }}
        </div>
      </template>
      <template #item.interpreted_by_name="{ item }">
        <EntityLink
          :to="hcpDetailLink((item as SleepStudyRow).interpreted_by)"
          :label="(item as SleepStudyRow).interpreted_by_name"
          :first-name="(item as SleepStudyRow).interpreted_by_first_name"
          :last-name="(item as SleepStudyRow).interpreted_by_last_name"
          entity-type="hcp"
          :specialty="(item as SleepStudyRow).interpreted_by_specialty"
          :details="doctorOf(item as SleepStudyRow).details"
          :more-details="doctorOf(item as SleepStudyRow).more"
          :avatar-size="32"
        />
      </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { intlLocale } from "@i18n/language-options";
import AppEntityList, { type AppEntityListQueues } from "../components/AppEntityList.vue";
import EntityLink from "../components/EntityLink.vue";
import AppAvatar from "../components/AppAvatar.vue";
import StudyResultCell from "../components/clinicalLists/StudyResultCell.vue";
import { useIdentity } from "../composables/useIdentity";
import { shortPersonName } from "../utils/shortPersonName";
import type { FilterDefinition } from "../composables/useFilters";
import { hcpDetailLink } from "../utils/entityLinks";
import { sleepStudyDetailQuery } from "../utils/clinicalListLinks";
import { formatDateShort, formatRelativeToNow } from "../utils/relativeDate";
import {
  STUDY_QUEUE_OPTIONS,
  isStudyAttention,
  studyStepKey,
  studyStepSince,
  type StudyProgress,
  type StudyStep,
} from "../utils/clinicalProgress";
import { useAuthStore } from "../stores/auth";

interface SleepStudyRow {
  patient_name?: string | null;
  status: string;
  study_type?: string;
  study_date: string | null;
  created_at: string;
  ahi_score: number | null;
  spo2_nadir: number | null;
  odi: number | null;
  results_received_at: string | null;
  device_delivered_at: string | null;
  interpreted_at: string | null;
  interpreted_by?: string | null;
  interpreted_by_name?: string | null;
  interpreted_by_first_name?: string | null;
  interpreted_by_last_name?: string | null;
  patient_first_name?: string | null;
  patient_last_name?: string | null;
  interpreted_by_specialty?: string | null;
  interpreted_by_specialties?: string[] | null;
  progress: StudyProgress;
}

const { t, locale } = useI18n();
const dateLocale = computed(() => intlLocale(locale.value));
const { specialtySet } = useIdentity();
const authStore = useAuthStore();
const role = computed(() => authStore.user?.role);
// The doctor reads the list as their own queue (chips); the "Interpreted by" column stays for staff.
const isDoctor = computed(() => role.value === "doctor");

const queues = computed<AppEntityListQueues | undefined>(() =>
  isDoctor.value || role.value === "admin"
    ? { endpoint: "/api/v1/sleep-study/queues", options: STUDY_QUEUE_OPTIONS, ariaLabelKey: "app.clinicalQueues.ariaLabel", attentionValue: "action" }
    : undefined,
);

function doctorOf(row: SleepStudyRow) {
  return specialtySet(row.interpreted_by_specialty, row.interpreted_by_specialties);
}

function stepOf(item: unknown): StudyStep {
  return (item as SleepStudyRow).progress.next_step;
}

const STATUSES = ["ordered", "device_shipped", "device_delivered", "study_complete", "results_received", "interpreted", "cancelled"];

function statusKey(status: string): string {
  return status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const statusOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  ...STATUSES.map((s) => ({ title: t(`app.sleepStudies.status.${statusKey(s)}`), value: s })),
]);

const filterDefinitions = computed<FilterDefinition[]>(() => [
  { key: "status", labelKey: "app.sleepStudies.table.status", type: "select", default: "", options: statusOptions.value },
]);

function phaseLabel(row: SleepStudyRow): string {
  return t(row.progress.phase === "control" ? "app.clinicalQueues.study.control" : "app.clinicalQueues.study.initial");
}

/** "Home study · 28/9/2026" — the study's own date, else when it was ordered. */
function studySub(row: SleepStudyRow): string {
  return [t("app.clinicalQueues.study.home"), formatDateShort(row.study_date ?? row.created_at, dateLocale.value)].join(" · ");
}

function stepSince(row: SleepStudyRow): string {
  return formatRelativeToNow(studyStepSince(row, row.progress.next_step), dateLocale.value);
}

/** Phone card: phase, and the AHI once there is one. */
function cardMeta(row: SleepStudyRow): string {
  const ahi = row.ahi_score !== null ? `${t("app.clinicalQueues.table.ahi")} ${row.ahi_score.toLocaleString(dateLocale.value, { maximumFractionDigits: 1 })}` : "";
  return [phaseLabel(row), ahi].filter(Boolean).join(" · ");
}

const tableHeaders = computed(() => [
  { title: t("app.sleepStudies.table.patient"), key: "patient_name", sortable: false },
  { title: t("app.clinicalQueues.table.study"), key: "study", sortable: false },
  { title: t("app.clinicalQueues.table.result"), key: "result", sortable: false },
  { title: t("app.clinicalQueues.table.nextStep"), key: "next_step", sortable: false },
  ...(isDoctor.value ? [] : [{ title: t("app.sleepStudies.table.interpretedBy"), key: "interpreted_by_name", sortable: false }]),
]);

const listI18n = computed(() => ({
  searchPlaceholder: "app.sleepStudies.searchPlaceholder",
  filtersTitle: "app.patients.filters.title",
  filtersClear: "app.patients.filters.clear",
  add: "app.sleepStudies.title",
  emptyTitle: "app.sleepStudies.emptyTitle",
  emptySubtitle: "app.sleepStudies.emptySubtitle",
  countNoun: "studies" as const,
  noResultsForCriteria: "app.patients.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "app.patients.noResultsForCriteriaSubtitle",
  tableNoResults: "app.sleepStudies.table.noResults",
  errorLoad: "app.sleepStudies.errorLoad",
}));
</script>

<style scoped>
.sleep-studies-view__sub {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.sleep-studies-view__step {
  font-weight: 500;
}
.sleep-studies-view__step--attention {
  color: rgb(var(--v-theme-warning));
}
.sleep-studies-view__card-step {
  font-weight: 500;
}
</style>
