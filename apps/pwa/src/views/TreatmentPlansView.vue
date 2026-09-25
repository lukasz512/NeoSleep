<template>
  <div class="treatment-plans-view">
    <AppEntityList
      view-id="treatment-plans"
      api-endpoint="/api/v1/treatment-plan"
      :cacheable="false"
      :headers="tableHeaders"
      :filter-definitions="filterDefinitions"
      :i18n="listI18n"
      detail-route-name="patient-detail"
      detail-route-param="patient_id"
      :detail-route-query="detailRouteQuery"
      :filter-param-keys="['status', 'type']"
    >
      <template #item.patient_name="{ item }">
        <EntityLink :to="null" entity-type="patient" :label="(item as TreatmentPlanRow).patient_name" :avatar-size="32" />
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar :name="(item as TreatmentPlanRow).patient_name" entity-type="patient" :size="55" />
      </template>
      <template #feed-card-title="{ item }">
        {{ (item as { patient_name?: string }).patient_name || "—" }}
      </template>
      <template #item.type="{ item }">
        {{ typeLabel((item as { type?: string }).type) }}
      </template>
      <template #item.status="{ item }">
        <VChip :color="statusColor((item as { status?: string }).status)" size="small" variant="tonal">
          {{ statusLabel((item as { status?: string }).status) }}
        </VChip>
      </template>
      <template #feed-card-status="{ item }">
        <VChip :color="statusColor((item as { status?: string }).status)" size="x-small" variant="tonal">
          {{ statusLabel((item as { status?: string }).status) }}
        </VChip>
      </template>
      <template #feed-card-meta="{ item }">
        <EntityMetaLine
          :text="treatmentPlanCardMeta(item as TreatmentPlanRow)"
          :to="hcpDetailLink((item as TreatmentPlanRow).dentist_id)"
          :label="(item as TreatmentPlanRow).dentist_name"
          entity-type="hcp"
        />
      </template>
      <template #item.dentist_name="{ item }">
        <EntityLink
          :to="hcpDetailLink((item as TreatmentPlanRow).dentist_id)"
          :label="(item as TreatmentPlanRow).dentist_name"
          entity-type="hcp"
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
import AppEntityList from "../components/AppEntityList.vue";
import EntityLink from "../components/EntityLink.vue";
import { useIdentity } from "../composables/useIdentity";
import EntityMetaLine from "../components/EntityMetaLine.vue";
import AppAvatar from "../components/AppAvatar.vue";
import type { FilterDefinition } from "../composables/useFilters";
import { treatmentPlanCardMeta as treatmentPlanCardMetaFormatter } from "../utils/mobileCardMeta";
import { hcpDetailLink } from "../utils/entityLinks";

interface TreatmentPlanRow {
  patient_name?: string | null;
  type?: string;
  dentist_id?: string | null;
  dentist_name?: string | null;
  dentist_specialty?: string | null;
  dentist_specialties?: string[] | null;
}

const { t } = useI18n();
const { specialtySet } = useIdentity();
function doctorOf(row: TreatmentPlanRow) {
  return specialtySet(row.dentist_specialty, row.dentist_specialties);
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

function statusColor(status?: string): string {
  switch (status) {
    case "completed": return "success";
    case "in_progress":
    case "patient_notified": return "info";
    case "cancelled": return "default";
    case "on_hold": return "warning";
    default: return "warning";
  }
}

function statusLabel(status?: string): string {
  return status ? t(`app.treatmentPlans.status.${camelKey(status)}`) : "—";
}

function typeLabel(type?: string): string {
  return type ? t(`app.treatmentPlans.type.${camelKey(type)}`) : "—";
}

/** Mobile card's second line — the type; the dentist is appended as an
 *  EntityLink by EntityMetaLine (status is shown via the chip already, not
 *  repeated here — NEO-19). */
function treatmentPlanCardMeta(plan: TreatmentPlanRow): string {
  return treatmentPlanCardMetaFormatter(plan, typeLabel);
}

/** Only dental_appliance plans have their own tab today — everything else lands on Details. */
function detailRouteQuery(item: Record<string, unknown>): Record<string, string> {
  return { tab: item.type === "dental_appliance" ? "orthoapnea" : "details" };
}

const tableHeaders = computed(() => [
  { title: t("app.treatmentPlans.table.patient"), key: "patient_name", sortable: false },
  { title: t("app.treatmentPlans.table.type"), key: "type", sortable: true },
  { title: t("app.treatmentPlans.table.status"), key: "status", sortable: true },
  { title: t("app.treatmentPlans.table.doctor"), key: "dentist_name", sortable: false },
]);

const listI18n = computed(() => ({
  searchPlaceholder: "app.treatmentPlans.searchPlaceholder",
  filtersTitle: "app.patients.filters.title",
  filtersClear: "app.patients.filters.clear",
  add: "app.treatmentPlans.title",
  emptyTitle: "app.treatmentPlans.emptyTitle",
  emptySubtitle: "app.treatmentPlans.emptySubtitle",
  noResultsForCriteria: "app.patients.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "app.patients.noResultsForCriteriaSubtitle",
  tableNoResults: "app.treatmentPlans.table.noResults",
  errorLoad: "app.treatmentPlans.errorLoad",
}));
</script>
