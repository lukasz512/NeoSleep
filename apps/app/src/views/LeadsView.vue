<template>
  <div class="leads-view">
    <LeadContactForm
      v-if="showAddModal"
      v-model="showAddModal"
      mode="lead"
      @submit="onLeadSubmit"
    />
    <RepEntityList
      view-id="leads"
      api-endpoint="/api/leads"
      :headers="tableHeaders"
      :filter-definitions="leadFilterDefs"
      :filter-definitions-with-options="leadFilterDefinitions"
      :i18n="leadsI18n"
      :show-add-button="true"
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
    </RepEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import RepEntityList from "../components/RepEntityList.vue";
import GenderIcon from "../components/GenderIcon.vue";

const LeadContactForm = defineAsyncComponent(() => import("../components/LeadContactForm.vue"));
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import { useRepFilters, type RepFilterDefinition } from "../composables/useRepFilters";
import { useAuthStore } from "../stores/auth";
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
const isAdmin = computed(() => authStore.user?.role === "admin");
const showAddModal = ref(false);
const notifications = useNotifications();

const leadFilterDefs: RepFilterDefinition[] = [
  { key: "status", labelKey: "rep.leads.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "rep.leads.filters.region", type: "select", default: "" },
];

const statusOptions = computed(() => [
  { title: t("rep.leads.filters.all"), value: "" },
  { title: t("rep.leads.filters.statusNew"), value: "new", chipClass: "rep-lead-status-chip--new" },
  { title: t("rep.leads.filters.statusOngoing"), value: "ongoing", chipClass: "rep-lead-status-chip--ongoing" },
  { title: t("rep.leads.filters.statusAccepted"), value: "accepted", chipClass: "rep-lead-status-chip--accepted" },
  { title: t("rep.leads.filters.statusRejected"), value: "rejected", chipClass: "rep-lead-status-chip--rejected" },
  { title: t("rep.leads.filters.statusCompleted"), value: "completed", chipClass: "rep-lead-status-chip--completed" },
]);
const regionOptions = computed(() => [
  { title: t("rep.leads.filters.all"), value: "" },
  { title: "North", value: "North" },
  { title: "Central", value: "Central" },
  { title: "South", value: "South" },
]);

const leadFilterDefinitions = computed<RepFilterDefinition[]>(() => [
  { ...leadFilterDefs[0], options: statusOptions.value },
  { ...leadFilterDefs[1], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("rep.leads.table.name"), key: "name", sortable: true },
  { title: t("rep.leads.table.email"), key: "email", sortable: true },
  { title: t("rep.leads.table.status"), key: "status", sortable: true },
  { title: t("rep.leads.table.region"), key: "region", sortable: true },
  { title: t("rep.leads.table.institution"), key: "institution", sortable: false },
]);


const leadsI18n = computed(() => ({
  searchPlaceholder: "rep.leads.searchPlaceholder",
  filtersTitle: "rep.leads.filters.title",
  filtersClear: "rep.leads.filters.clear",
  add: "rep.leads.add",
  emptyTitle: "rep.leads.emptyTitle",
  emptySubtitle: "rep.leads.emptySubtitle",
  noResultsForCriteria: "rep.leads.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "rep.leads.noResultsForCriteriaSubtitle",
  tableNoResults: "rep.leads.table.noResults",
  errorLoad: "rep.leads.errorLoad",
}));

function statusLabel(status: string): string {
  const key = leadStatusI18nKey(status);
  return key ? t(key) : status || t("rep.leads.filters.statusNew");
}

function isRejected(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "rejected";
}

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
  const d = data as import("../components/LeadContactForm.vue").LeadFormData;
  const body = JSON.stringify({
    name: d.name,
    email: d.email || undefined,
    status: d.status || "new",
    region: d.region || undefined,
    institution: d.institution || undefined,
  });
  const res = await apiFetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "rep.leads.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("rep.leads.form.success"), "success");
    showAddModal.value = false;
    window.dispatchEvent(new Event("rep-entity-list-refresh"));
  }
}
</script>

<style lang="scss" scoped>
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

