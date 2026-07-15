<template>
  <div class="leads-view">
    <LeadForm
      v-if="showAddModal"
      v-model="showAddModal"
      @submit="onLeadSubmit"
    />
    <AppEntityList
      view-id="leads"
      api-endpoint="/api/v1/lead"
      :headers="tableHeaders"
      :filter-definitions="leadFilterDefinitions"
      :i18n="leadsI18n"
      :show-add-button="isAdmin"
      detail-route-name="lead-detail"
      :filter-param-keys="['status', 'region']"
      @add="onAddLead"
    >
    <template #item.name="{ item }">
      <span class="leads-name-cell">
        <GenderIcon :gender="getGenderFromName(getLeadFromItem(item).name)" />
        {{ getLeadFromItem(item).name }}
      </span>
    </template>
    <template #feed-card-title="{ item }">
      <span class="leads-name-cell">
        <GenderIcon :gender="getGenderFromName(getLeadFromItem(item).name)" />
        {{ getLeadFromItem(item).name }}
      </span>
    </template>
    <template #item.email="{ item }">
      <span v-if="isInactive(getLeadFromItem(item))" class="app-entity-list__cell-empty">—</span>
      <span v-else>{{ getLeadFromItem(item).email || "—" }}</span>
    </template>
    <template #item.status="{ item }">
      <div class="leads-status-cell">
        <span
          :class="['pwa-lead-status-chip', `pwa-lead-status-chip--${leadStatusClass(getLeadFromItem(item).status)}`]"
        >
          {{ statusLabel(getLeadFromItem(item).status) }}
        </span>
      </div>
    </template>
    <template #feed-card-meta="{ item }">
      <span class="leads-feed-meta">
        <span
          :class="['pwa-lead-status-chip', `pwa-lead-status-chip--${leadStatusClass(getLeadFromItem(item).status)}`]"
        >
          {{ statusLabel(getLeadFromItem(item).status) }}
        </span>
        <span
          v-if="!isInactive(getLeadFromItem(item)) && (getLeadFromItem(item).email || getLeadFromItem(item).region)"
          class="leads-feed-meta-rest"
        >
          {{ [getLeadFromItem(item).email, getLeadFromItem(item).region].filter(Boolean).join(" · ") }}
        </span>
      </span>
    </template>
    <template #item.institution="{ item }">
      <RouterLink
        v-if="getLeadFromItem(item).institution"
        :to="hcoLink(getLeadFromItem(item).institution!)"
        class="app-entity-list__institution-link"
        @click.stop
      >
        {{ getLeadFromItem(item).institution }}
      </RouterLink>
      <span v-else class="app-entity-list__cell-empty">—</span>
    </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import GenderIcon from "../components/GenderIcon.vue";

const LeadForm = defineAsyncComponent(() => import("../components/LeadForm.vue"));
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { getGenderFromName } from "../utils/genderFromName";
import { leadStatusClass, leadStatusI18nKey } from "../utils/leadStatus";

export interface Lead {
  id: string;
  name: string;
  salutation?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  status: string;
  region: string;
  institution?: string;
  specialty?: string;
  notes?: string;
  country_code?: string | null;
  converted_to_id?: string | null;
  converted_to_type?: string | null;
  converted_at?: string | null;
}

const { t } = useI18n();
const authStore = useAuthStore();
const configStore = useConfigStore();
const isAdmin = computed(() => authStore.user?.role === "admin");
const showAddModal = ref(false);
const notifications = useNotifications();

const leadFilterDefs: FilterDefinition[] = [
  { key: "status", labelKey: "user.leads.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "user.leads.filters.region", type: "select", default: "" },
];

const statusOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  { title: t("user.leads.filters.statusNew"), value: "new", chipClass: "pwa-lead-status-chip--new" },
  { title: t("user.leads.filters.statusContacted"), value: "contacted", chipClass: "pwa-lead-status-chip--contacted" },
  { title: t("user.leads.filters.statusQualified"), value: "qualified", chipClass: "pwa-lead-status-chip--qualified" },
  { title: t("user.leads.filters.statusInactive"), value: "inactive", chipClass: "pwa-lead-status-chip--inactive" },
  { title: t("user.leads.filters.statusConverted"), value: "converted", chipClass: "pwa-lead-status-chip--converted" },
]);
const regionOptions = computed(() => configStore.regionItems);

const leadFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...leadFilterDefs[0], options: statusOptions.value },
  { ...leadFilterDefs[1], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.leads.table.name"), key: "name", sortable: true },
  { title: t("user.leads.table.email"), key: "email", sortable: true },
  { title: t("user.leads.table.status"), key: "status", sortable: true },
  { title: t("user.leads.table.region"), key: "region", sortable: true },
  { title: t("user.leads.table.institution"), key: "institution", sortable: false },
]);


const leadsI18n = computed(() => ({
  searchPlaceholder: "user.leads.searchPlaceholder",
  filtersTitle: "user.leads.filters.title",
  filtersClear: "user.leads.filters.clear",
  add: "user.leads.add",
  emptyTitle: "user.leads.emptyTitle",
  emptySubtitle: "user.leads.emptySubtitle",
  noResultsForCriteria: "user.leads.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.leads.noResultsForCriteriaSubtitle",
  tableNoResults: "user.leads.table.noResults",
  errorLoad: "user.leads.errorLoad",
}));

function statusLabel(status: string): string {
  const key = leadStatusI18nKey(status);
  return key ? t(key) : status || t("user.leads.filters.statusNew");
}

function isInactive(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "inactive";
}

/** Unwrap Vuetify's internal item wrapper (VDataTable provides `{ raw: T }` via slot). */
function getLeadFromItem(item: unknown): Lead {
  const o = item as { raw?: Lead };
  return (o?.raw ?? item) as Lead;
}

function hcoLink(institutionName: string) {
  return { path: "/hco", query: { institution: institutionName } };
}

function onAddLead() {
  showAddModal.value = true;
}

async function onLeadSubmit(data: import("../components/LeadForm.vue").LeadSubmitPayload) {
  const body = JSON.stringify({
    salutation: data.salutation,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone,
    status: data.status || "new",
    region: data.region,
    institution: data.institution,
  });
  const res = await apiFetch("/api/v1/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "user.leads.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.leads.form.success"), "success");
    showAddModal.value = false;
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}
</script>

<style scoped>
.leads-status-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.leads-feed-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.leads-feed-meta-rest {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.leads-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>

