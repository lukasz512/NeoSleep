<template>
  <!-- HCO detail "Médicos" tab (NEO-14, docs/stories/hco-medicos-table.md).
       Not cached offline: the counts are derived from patient/treatment data.
       Desktop only: sized to the bottom of the page (useFillViewportHeight) so
       the table scrolls inside itself instead of stretching the detail page.
       Mobile keeps AppEntityList's own card-feed sizing (page scrolls). -->
  <div
    ref="rootRef"
    :class="['org-practitioners', { 'org-practitioners--fit': fitToPage }]"
    :style="fitToPage ? { height: `${height}px` } : undefined"
  >
    <AppEntityList
      view-id="hco-practitioners"
      :api-endpoint="`/api/v1/organization/${organizationId}/practitioners`"
      :headers="tableHeaders"
      :filter-definitions="filterDefinitions"
      :i18n="listI18n"
      detail-route-name="hcp-detail"
      :filter-param-keys="['specialty']"
      :cacheable="false"
    >
      <template #item.name="{ item }">
        <EntityLink
          :to="null"
          entity-type="hcp"
          :label="asRow(item).name"
          :first-name="asRow(item).first_name"
          :last-name="asRow(item).last_name"
          :tags="specialtySet(asRow(item).primary_specialty, asRow(item).specialties).tags"
          :more-tags="specialtySet(asRow(item).primary_specialty, asRow(item).specialties).more"
          :avatar-size="32"
        />
      </template>
      <template #item.efficiency_pct="{ item }">
        {{ formatEfficiency(asRow(item).efficiency_pct) }}
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar :name="asRow(item).name" :first-name="asRow(item).first_name" :last-name="asRow(item).last_name" entity-type="hcp" :size="55" />
      </template>
      <template #feed-card-title="{ item }">
        {{ asRow(item).name }}
      </template>
      <template #feed-card-meta="{ item }">
        {{ cardMeta(asRow(item)) }}
      </template>
      <template #feed-card-status="{ item }">
        <VChip size="x-small" variant="tonal" color="primary">
          {{ specialtyLabel(asRow(item).primary_specialty) }}
        </VChip>
      </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import AppEntityList from "../AppEntityList.vue";
import AppAvatar from "../AppAvatar.vue";
import EntityLink from "../EntityLink.vue";
import { useIdentity } from "../../composables/useIdentity";
import { type FilterDefinition } from "../../composables/useFilters";
import { useFillViewportHeight } from "../../composables/useFillViewportHeight";
import { useConfigStore } from "../../stores/config";

/** Row shape of GET /api/v1/organization/:id/practitioners (PractitionerWithStatsDto). */
export interface OrganizationPractitionerRow {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  primary_specialty?: string;
  specialties?: string[] | null;
  patient_count: number;
  device_count: number;
  efficiency_pct: number | null;
}

defineProps<{ organizationId: string }>();

const { t } = useI18n();
const { specialtySet } = useIdentity();
const configStore = useConfigStore();

const { mobile } = useDisplay();
const rootRef = ref<HTMLElement | null>(null);
const { height } = useFillViewportHeight(rootRef);
const fitToPage = computed(() => !mobile.value && height.value !== null);

function asRow(item: unknown): OrganizationPractitionerRow {
  return item as OrganizationPractitionerRow;
}

const filterDefinitions = computed<FilterDefinition[]>(() => [
  {
    key: "specialty",
    labelKey: "user.hcp.filters.specialty",
    type: "select",
    default: "",
    options: [{ title: t("user.leads.filters.all"), value: "" }, ...configStore.specialtyItems],
  },
]);

const tableHeaders = computed(() => [
  { title: t("user.hcp.table.name"), key: "name", sortable: true },
  { title: t("user.hco.detail.doctors.table.patients"), key: "patient_count", sortable: true },
  { title: t("user.hco.detail.doctors.table.devices"), key: "device_count", sortable: true },
  { title: t("user.hco.detail.doctors.table.efficiency"), key: "efficiency_pct", sortable: true },
]);

const listI18n = {
  searchPlaceholder: "user.hcp.searchPlaceholder",
  filtersTitle: "user.hcp.filters.title",
  filtersClear: "user.hcp.filters.clear",
  add: "user.hcp.add",
  emptyTitle: "user.hco.detail.relatedDoctorsEmpty",
  emptySubtitle: "user.hco.detail.doctors.emptySubtitle",
  noResultsForCriteria: "user.hcp.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.hcp.noResultsForCriteriaSubtitle",
  tableNoResults: "user.hcp.table.noResults",
  errorLoad: "user.hcp.errorLoad",
};

function specialtyLabel(code?: string): string {
  if (!code) return "—";
  return configStore.specialtyItems.find((o) => o.value === code)?.title ?? code;
}

function formatEfficiency(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

function cardMeta(row: OrganizationPractitionerRow): string {
  return t("user.hco.detail.doctors.cardMeta", {
    patients: row.patient_count,
    devices: row.device_count,
    efficiency: formatEfficiency(row.efficiency_pct),
  });
}
</script>

<style scoped>
.org-practitioners--fit {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* AppEntityList's 70vh floor is for full-page list views; on desktop here the
   wrapper's measured height is the size, and the table scrolls inside it. */
.org-practitioners--fit :deep(.app-entity-list__table-wrap) {
  min-height: 0;
}
</style>
