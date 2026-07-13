<template>
  <div class="leads-view">
    <LeadContactForm
      v-if="showAddModal"
      v-model="showAddModal"
      mode="lead"
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
      <span v-if="isRejected(getLeadFromItem(item))" class="rep-entity-list__cell-empty">—</span>
      <span v-else>{{ getLeadFromItem(item).email || "—" }}</span>
    </template>
    <template #item.status="{ item }">
      <div class="leads-status-cell">
        <span
          :class="['rep-lead-status-chip', `rep-lead-status-chip--${leadStatusClass(getLeadFromItem(item).status)}`]"
        >
          {{ statusLabel(getLeadFromItem(item).status) }}
        </span>
      </div>
    </template>
    <template #feed-card-meta="{ item }">
      <span class="leads-feed-meta">
        <span
          :class="['rep-lead-status-chip', `rep-lead-status-chip--${leadStatusClass(getLeadFromItem(item).status)}`]"
        >
          {{ statusLabel(getLeadFromItem(item).status) }}
        </span>
        <span
          v-if="!isRejected(getLeadFromItem(item)) && (getLeadFromItem(item).email || getLeadFromItem(item).region)"
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
        class="rep-entity-list__institution-link"
        @click.stop
      >
        {{ getLeadFromItem(item).institution }}
      </RouterLink>
      <span v-else class="rep-entity-list__cell-empty">—</span>
    </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import GenderIcon from "../components/GenderIcon.vue";

const LeadContactForm = defineAsyncComponent(() => import("../components/LeadContactForm.vue"));
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
  email: string;
  phone?: string;
  status: string;
  region: string;
  institution?: string;
  specialty?: string;
  notes?: string;
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
  { title: t("user.leads.filters.statusNew"), value: "new", chipClass: "rep-lead-status-chip--new" },
  { title: t("user.leads.filters.statusOngoing"), value: "ongoing", chipClass: "rep-lead-status-chip--ongoing" },
  { title: t("user.leads.filters.statusAccepted"), value: "accepted", chipClass: "rep-lead-status-chip--accepted" },
  { title: t("user.leads.filters.statusRejected"), value: "rejected", chipClass: "rep-lead-status-chip--rejected" },
  { title: t("user.leads.filters.statusCompleted"), value: "completed", chipClass: "rep-lead-status-chip--completed" },
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

function isRejected(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "rejected";
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

async function onLeadSubmit(data: import("../components/LeadContactForm.vue").LeadFormData | import("../components/LeadContactForm.vue").ContactFormData) {
  // This view uses mode="lead", so the emitted payload is always LeadFormData.
  const d = data as import("../components/LeadContactForm.vue").LeadFormData;
  const body = JSON.stringify({
    name: d.name,
    email: d.email || undefined,
    status: d.status || "new",
    region: d.region || undefined,
    institution: d.institution || undefined,
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

