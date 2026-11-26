<template>
  <div class="treatment-plans-view">
    <DeviceOrderReconciliationCard v-if="isManager" mode="counter" />
    <AppEntityList
      view-id="treatment-plans"
      api-endpoint="/api/v1/treatment-plan"
      :cacheable="false"
      :headers="tableHeaders"
      :filter-definitions="filterDefinitions"
      :i18n="listI18n"
      :queues="queues"
      detail-route-name="patient-detail"
      detail-route-param="patient_id"
      :detail-route-query="treatmentPlanDetailQuery"
      :filter-param-keys="['status', 'type']"
    >
      <template #item.patient_name="{ item }">
        <EntityLink
          :to="null"
          entity-type="patient"
          :label="(item as TreatmentPlanRow).patient_name"
          :first-name="(item as TreatmentPlanRow).patient_first_name"
          :last-name="(item as TreatmentPlanRow).patient_last_name"
          :avatar-size="32"
        />
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar :name="(item as TreatmentPlanRow).patient_name" entity-type="patient" :size="55" />
      </template>
      <template #feed-card-title="{ item }">
        {{ shortPersonName((item as TreatmentPlanRow).patient_name, (item as TreatmentPlanRow).patient_first_name, (item as TreatmentPlanRow).patient_last_name) || "—" }}
      </template>
      <template #item.stage="{ item }">
        <div class="treatment-plans-view__stage">
          <AppSegmentProgress
            :segments="treatmentSegments(progressOf(item).stage)"
            :aria-label="stageText(item as TreatmentPlanRow)"
          />
          <span class="treatment-plans-view__stage-label">{{ stageText(item as TreatmentPlanRow) }}</span>
        </div>
      </template>
      <template #item.next_visit="{ item }">
        <NextVisitCell :line="lineOf(item as TreatmentPlanRow)" :locale="dateLocale" />
      </template>
      <template #item.device="{ item }">
        <div>{{ t(`app.deviceOrder.state.${deviceOrderState(item as TreatmentPlanRow)}`) }}</div>
        <div v-if="deviceSub(item as TreatmentPlanRow)" class="treatment-plans-view__sub">{{ deviceSub(item as TreatmentPlanRow) }}</div>
      </template>
      <template #item.ahi="{ item }">
        <AhiTrend :baseline="progressOf(item).ahi_baseline" :latest="progressOf(item).ahi_latest" />
      </template>
      <!-- Phone card: the name keeps the full width; stage bar, stage and next visit stack under it. -->
      <template #feed-card-meta="{ item }">
        <div class="treatment-plans-view__card-stage">
          <AppSegmentProgress :segments="treatmentSegments(progressOf(item).stage)" :aria-label="stageText(item as TreatmentPlanRow)" />
          <span>{{ cardMeta(item as TreatmentPlanRow) }}</span>
          <NextVisitCell :line="lineOf(item as TreatmentPlanRow)" :locale="dateLocale" compact />
        </div>
      </template>
      <template #item.type="{ item }">
        {{ typeLabel((item as { type?: string }).type) }}
      </template>
      <template #item.dentist_name="{ item }">
        <EntityLink
          :to="hcpDetailLink((item as TreatmentPlanRow).dentist_id)"
          :label="(item as TreatmentPlanRow).dentist_name"
          :first-name="(item as TreatmentPlanRow).dentist_first_name"
          :last-name="(item as TreatmentPlanRow).dentist_last_name"
          entity-type="hcp"
          :specialty="(item as TreatmentPlanRow).dentist_specialty"
          :details="doctorOf(item as TreatmentPlanRow).details"
          :more-details="doctorOf(item as TreatmentPlanRow).more"
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
import AppSegmentProgress from "../components/AppSegmentProgress.vue";
import NextVisitCell from "../components/clinicalLists/NextVisitCell.vue";
import AhiTrend from "../components/clinicalLists/AhiTrend.vue";
import { useIdentity } from "../composables/useIdentity";
import { shortPersonName } from "../utils/shortPersonName";
import type { FilterDefinition } from "../composables/useFilters";
import { hcpDetailLink } from "../utils/entityLinks";
import { treatmentPlanDetailQuery } from "../utils/clinicalListLinks";
import { deviceOrderState as orderState } from "../utils/treatmentPlanStatus";
import { formatDateShort } from "../utils/relativeDate";
import {
  TREATMENT_QUEUE_OPTIONS,
  nextVisitLine,
  treatmentSegments,
  treatmentStageLabel,
  type NextVisitLine,
  type TreatmentProgress,
} from "../utils/clinicalProgress";
import DeviceOrderReconciliationCard from "../components/DeviceOrderReconciliationCard.vue";
import { useAuthStore } from "../stores/auth";

interface TreatmentPlanRow {
  patient_name?: string | null;
  type?: string;
  status: string;
  metadata: Record<string, unknown> | null;
  order_sync_status: "pending" | "synced" | "failed" | null;
  appliance_delivered_at: string | null;
  dentist_id?: string | null;
  dentist_name?: string | null;
  dentist_first_name?: string | null;
  dentist_last_name?: string | null;
  patient_first_name?: string | null;
  patient_last_name?: string | null;
  dentist_specialty?: string | null;
  dentist_specialties?: string[] | null;
  progress: TreatmentProgress;
}

const { t, locale } = useI18n();
const dateLocale = computed(() => intlLocale(locale.value));
const { specialtySet } = useIdentity();
const authStore = useAuthStore();
const role = computed(() => authStore.user?.role);
// Managers see whether device orders match the lab, as a counter only (NEO-218, Łukasz Q3); admins see the full card on the dashboard.
const isManager = computed(() => role.value === "manager");
// The doctor reads the list as their own queue: chips, no "Doctor" column (always them), no "Type" (always a dental device).
const isDoctor = computed(() => role.value === "doctor");

const queues = computed<AppEntityListQueues | undefined>(() =>
  isDoctor.value || role.value === "admin"
    ? { endpoint: "/api/v1/treatment-plan/queues", options: TREATMENT_QUEUE_OPTIONS, ariaLabelKey: "app.clinicalQueues.ariaLabel", attentionValue: "action" }
    : undefined,
);

function doctorOf(row: TreatmentPlanRow) {
  return specialtySet(row.dentist_specialty, row.dentist_specialties);
}

function progressOf(item: unknown): TreatmentProgress {
  return (item as TreatmentPlanRow).progress;
}

const STATUSES = ["initiated", "patient_notified", "in_progress", "completed", "cancelled", "on_hold"];
const TYPES = ["cpap", "apap", "dental_appliance", "positional", "lifestyle", "watchful_waiting"];

function camelKey(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const statusOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  ...STATUSES.map((s) => ({ title: t(`app.treatmentPlans.status.${camelKey(s)}`), value: s })),
]);

const typeOptions = computed(() => [
  { title: t("app.patients.filters.all"), value: "" },
  ...TYPES.map((s) => ({ title: t(`app.treatmentPlans.type.${camelKey(s)}`), value: s })),
]);

const filterDefinitions = computed<FilterDefinition[]>(() => [
  { key: "status", labelKey: "app.treatmentPlans.table.status", type: "select", default: "", options: statusOptions.value },
  { key: "type", labelKey: "app.treatmentPlans.table.type", type: "select", default: "", options: typeOptions.value },
]);

function typeLabel(type?: string): string {
  return type ? t(`app.treatmentPlans.type.${camelKey(type)}`) : "—";
}

function stageText(row: TreatmentPlanRow): string {
  const { key, params } = treatmentStageLabel(row.progress);
  return t(key, params);
}

function lineOf(row: TreatmentPlanRow): NextVisitLine {
  return nextVisitLine(row.progress, row.order_sync_status === "failed");
}

function deviceOrderState(row: TreatmentPlanRow) {
  return orderState(row);
}

/** Under the order state: the advance level once recorded, else the delivery date. */
function deviceSub(row: TreatmentPlanRow): string {
  if (row.progress.advance_level !== null) return t("app.clinicalQueues.device.level", { level: row.progress.advance_level });
  if (row.progress.delivered_at) return formatDateShort(row.progress.delivered_at, dateLocale.value);
  return "";
}

/** Phone card: the stage, plus the advance level when there is one. */
function cardMeta(row: TreatmentPlanRow): string {
  const level = row.progress.advance_level !== null ? t("app.clinicalQueues.device.level", { level: row.progress.advance_level }) : "";
  return [stageText(row), level].filter(Boolean).join(" · ");
}

const tableHeaders = computed(() => [
  { title: t("app.treatmentPlans.table.patient"), key: "patient_name", sortable: false },
  { title: t("app.clinicalQueues.table.stage"), key: "stage", sortable: false },
  { title: t("app.clinicalQueues.table.nextVisit"), key: "next_visit", sortable: false },
  { title: t("app.clinicalQueues.table.device"), key: "device", sortable: false },
  { title: t("app.clinicalQueues.table.ahi"), key: "ahi", sortable: false },
  ...(isDoctor.value
    ? []
    : [
        { title: t("app.treatmentPlans.table.type"), key: "type", sortable: true },
        { title: t("app.treatmentPlans.table.doctor"), key: "dentist_name", sortable: false },
      ]),
]);

const listI18n = computed(() => ({
  searchPlaceholder: "app.treatmentPlans.searchPlaceholder",
  filtersTitle: "app.patients.filters.title",
  filtersClear: "app.patients.filters.clear",
  add: "app.treatmentPlans.title",
  emptyTitle: "app.treatmentPlans.emptyTitle",
  emptySubtitle: "app.treatmentPlans.emptySubtitle",
  countNoun: "devices" as const,
  noResultsForCriteria: "app.patients.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "app.patients.noResultsForCriteriaSubtitle",
  tableNoResults: "app.treatmentPlans.table.noResults",
  errorLoad: "app.treatmentPlans.errorLoad",
}));
</script>

<style scoped>
.treatment-plans-view__stage {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  max-width: 220px;
}
.treatment-plans-view__stage :deep(.app-segment-progress__track) {
  height: 6px;
}
.treatment-plans-view__stage-label,
.treatment-plans-view__sub {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.treatment-plans-view__card-stage {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 220px;
}
</style>
