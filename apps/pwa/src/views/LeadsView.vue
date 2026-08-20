<template>
  <div class="leads-view">
    <FormRenderer
      v-model="showAddModal"
      :fields="leadFormFields"
      title-key="user.leads.form.title"
      submit-label-key="user.leads.form.submit"
      avatar-entity-type="lead"
      @submit="onLeadSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="leadFormFields"
      :initial-data="selectedLead ?? undefined"
      title-key="user.leads.form.title"
      edit-title-key="user.leads.form.editTitle"
      submit-label-key="user.leads.form.submit"
      edit-submit-label-key="user.leads.form.editSubmit"
      avatar-entity-type="lead"
      @submit="onLeadEditSubmit"
    />
    <FormRenderer
      v-model="showMoveToContactsModal"
      :fields="hcpFormFields"
      :derive="hcpFormDerive"
      :initial-data="moveToContactsInitialData"
      title-key="user.hcp.form.title"
      submit-label-key="user.hcp.form.submit"
      verify-info-key="user.leads.form.verifyDataInfo"
      avatar-entity-type="hcp"
      @submit="onContactSubmit"
    />
    <FormRenderer
      v-model="showInviteModal"
      :fields="partnerInviteFormFields"
      :initial-data="inviteInitialData"
      title-key="user.leads.form.inviteTitle"
      submit-label-key="user.leads.form.inviteSubmit"
      avatar-entity-type="lead"
      @submit="onInviteSubmit"
    />
    <FormRenderer
      v-model="showConvertToPatientModal"
      :fields="patientFormFields"
      :initial-data="convertToPatientInitialData"
      title-key="app.patients.form.title"
      submit-label-key="app.patients.form.submit"
      verify-info-key="user.leads.form.verifyDataInfo"
      avatar-entity-type="patient"
      @submit="onConvertToPatientSubmit"
    />
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <AppEntityList
      view-id="leads"
      api-endpoint="/api/v1/lead"
      :headers="tableHeaders"
      :filter-definitions="leadFilterDefinitions"
      :i18n="leadsI18n"
      :show-add-button="isAdmin"
      detail-route-name="lead-detail"
      :filter-param-keys="['status', 'region', 'type']"
      @add="onAddLead"
    >
    <template #item.name="{ item }">
      <span class="leads-name-cell">
        <AppAvatar :name="getLeadFromItem(item).name" entity-type="lead" :size="32" />
        <GenderIcon :gender="getGenderFromName(getLeadFromItem(item).name)" />
        {{ getLeadFromItem(item).name }}
      </span>
    </template>
    <template #feed-card-avatar="{ item }">
      <AppAvatar :name="getLeadFromItem(item).name" entity-type="lead" :size="55" />
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
    <template #item.type="{ item }">
      {{ typeLabel(getLeadFromItem(item).type) }}
    </template>
    <template #feed-card-meta="{ item }">
      <span v-if="leadSecondaryLine(getLeadFromItem(item))">
        {{ leadSecondaryLine(getLeadFromItem(item)) }}
      </span>
    </template>
    <template #feed-card-status="{ item }">
      <span
        :class="['pwa-lead-status-chip', `pwa-lead-status-chip--${leadStatusClass(getLeadFromItem(item).status)}`]"
      >
        {{ statusLabel(getLeadFromItem(item).status) }}
      </span>
    </template>
    <template #item.institution="{ item }">
      <RouterLink
        v-if="leadInstitution(getLeadFromItem(item))"
        :to="hcoLink(leadInstitution(getLeadFromItem(item)))"
        class="app-entity-list__institution-link"
        @click.stop
      >
        <AppIcon name="nav-hco" class="app-entity-list__institution-icon" />
        {{ leadInstitution(getLeadFromItem(item)) }}
      </RouterLink>
      <span v-else class="app-entity-list__cell-empty">—</span>
    </template>
    <template #feed-card-actions="{ item }">
      <AppListItemMenu :aria-label="t('app.common.moreActions')">
        <VListItem :title="t('user.detail.scheduleVisit')" @click="onScheduleVisit()">
          <template #prepend><AppIcon :name="entityActionIcon('scheduleVisit')" :class="entityActionMenuIconClass('scheduleVisit')" /></template>
        </VListItem>
        <VListItem
          v-if="getLeadFromItem(item).type === 'doctor' && !isConverted(getLeadFromItem(item))"
          :title="t('user.leads.detail.moveToContacts')"
          @click="onMoveToContacts(getLeadFromItem(item))"
        >
          <template #prepend><AppIcon :name="entityActionIcon('moveToContacts')" :class="entityActionMenuIconClass('moveToContacts')" /></template>
        </VListItem>
        <VListItem
          v-if="getLeadFromItem(item).type === 'patient' && !isConverted(getLeadFromItem(item))"
          :title="t('user.leads.detail.convertToPatient')"
          @click="onConvertToPatient(getLeadFromItem(item))"
        >
          <template #prepend><AppIcon :name="entityActionIcon('convertToPatient')" :class="entityActionMenuIconClass('convertToPatient')" /></template>
        </VListItem>
        <VListItem
          v-if="getLeadFromItem(item).type === 'doctor' && !isConverted(getLeadFromItem(item))"
          :title="t('user.leads.detail.inviteToPartner')"
          @click="onInvitePartner(getLeadFromItem(item))"
        >
          <template #prepend><AppIcon :name="entityActionIcon('inviteToPartner')" :class="entityActionMenuIconClass('inviteToPartner')" /></template>
        </VListItem>
        <VListItem v-if="isAdmin" :title="t('user.leads.detail.edit')" @click="onEditLead(getLeadFromItem(item))">
          <template #prepend><AppIcon :name="entityActionIcon('edit')" :class="entityActionMenuIconClass('edit')" /></template>
        </VListItem>
      </AppListItemMenu>
    </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import AppAvatar from "../components/AppAvatar.vue";
import GenderIcon from "../components/GenderIcon.vue";
import AppIcon from "../components/AppIcon.vue";
import AppListItemMenu from "../components/AppListItemMenu.vue";
import { entityActionIcon, entityActionMenuIconClass } from "../config/entityActions";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));
import { leadFormFields } from "../config/forms/leadForm";
import { hcpFormFields, hcpFormDerive } from "../config/forms/hcpForm";
import { patientFormFields } from "../config/forms/patientForm";
import { partnerInviteFormFields } from "../config/forms/partnerInviteForm";
import { createPractitionerFromLead } from "../utils/leadConversion";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { getGenderFromName } from "../utils/genderFromName";
import { leadStatusClass, leadStatusI18nKey, leadInstitution } from "../utils/leadStatus";

export interface Lead {
  id: string;
  name: string;
  salutation?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  status: string;
  type?: string;
  region: string;
  metadata?: Record<string, unknown> | null;
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
const showEditModal = ref(false);
const showMoveToContactsModal = ref(false);
const showConvertToPatientModal = ref(false);
const showInviteModal = ref(false);
const showEventForm = ref(false);
const selectedLead = ref<Lead | null>(null);
const eventFormInitial = ref<{ start_at: string; end_at: string } | undefined>(undefined);
const notifications = useNotifications();

/** Stable reference — see LeadDetailView.vue's identical computed for why an
 *  inline object literal would silently reset FormRenderer's open form. */
const moveToContactsInitialData = computed(() => (selectedLead.value ? {
  first_name: selectedLead.value.first_name,
  last_name: selectedLead.value.last_name,
  email: selectedLead.value.email ?? "",
  phone: selectedLead.value.phone ?? "",
  // Pre-fills the clinic combobox with the lead's own institution name —
  // isCreatingNewOrganization() resolves it against the loaded clinic list
  // once options finish loading (see hcpForm.ts).
  organization_id: leadInstitution(selectedLead.value),
} : undefined));

/** Same stable-reference reasoning as moveToContactsInitialData above. */
const inviteInitialData = computed(() => (selectedLead.value ? {
  first_name: selectedLead.value.first_name,
  last_name: selectedLead.value.last_name,
  email: selectedLead.value.email ?? "",
} : undefined));

/** Same stable-reference reasoning as moveToContactsInitialData above. */
const convertToPatientInitialData = computed(() => (selectedLead.value ? {
  first_name: selectedLead.value.first_name,
  last_name: selectedLead.value.last_name,
  email: selectedLead.value.email ?? "",
  phone: selectedLead.value.phone ?? "",
  region: selectedLead.value.region,
} : undefined));

const leadFilterDefs: FilterDefinition[] = [
  { key: "status", labelKey: "user.leads.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "user.leads.filters.region", type: "select", default: "" },
  { key: "type", labelKey: "user.leads.filters.type", type: "select", default: "" },
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

const typeOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  { title: t("user.leads.filters.typeDoctor"), value: "doctor" },
  { title: t("user.leads.filters.typeHospital"), value: "hospital" },
  { title: t("user.leads.filters.typePharmacy"), value: "pharmacy" },
  { title: t("user.leads.filters.typePatient"), value: "patient" },
  { title: t("user.leads.filters.typeOther"), value: "other" },
]);

const leadFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...leadFilterDefs[0], options: statusOptions.value },
  { ...leadFilterDefs[1], options: regionOptions.value },
  { ...leadFilterDefs[2], options: typeOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.leads.table.name"), key: "name", sortable: true },
  { title: t("user.leads.table.email"), key: "email", sortable: true },
  { title: t("user.leads.table.status"), key: "status", sortable: true },
  { title: t("user.leads.table.type"), key: "type", sortable: false },
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

const TYPE_LABEL_KEYS: Record<string, string> = {
  doctor: "user.leads.filters.typeDoctor",
  hospital: "user.leads.filters.typeHospital",
  pharmacy: "user.leads.filters.typePharmacy",
  patient: "user.leads.filters.typePatient",
  other: "user.leads.filters.typeOther",
};

function typeLabel(type: string | undefined): string {
  const key = TYPE_LABEL_KEYS[type ?? "other"];
  return key ? t(key) : t("user.leads.filters.typeOther");
}

function isInactive(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "inactive";
}

function isConverted(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "converted";
}

/** Second tile line — specialty when known, else the clinic the lead came in through. */
function leadSecondaryLine(lead: Lead): string {
  return lead.specialty || leadInstitution(lead) || "";
}

function onScheduleVisit() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  eventFormInitial.value = {
    start_at: new Date(`${date} 09:00`).toISOString(),
    end_at: new Date(`${date} 10:00`).toISOString(),
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(
  payload: import("../components/EventForm.vue").EventSubmitPayload,
  done: (ok: boolean) => void,
) {
  try {
    const res = await apiFetch("/api/v1/encounter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: payload.title, start_at: payload.start_at, end_at: payload.end_at, type: payload.type, status: payload.status, location: payload.location, video_link: payload.video_link, notes: payload.notes, region: payload.region, attendees: payload.attendees }),
    });
    if (res.ok) {
      notifications.show(t("user.planner.form.success"), "success");
      done(true);
    } else {
      notifications.show(t("user.planner.form.errorSave"), "error");
      done(false);
    }
  } catch {
    notifications.show(t("user.planner.form.errorSave"), "error");
    done(false);
  }
}

function onMoveToContacts(lead: Lead) {
  selectedLead.value = lead;
  showMoveToContactsModal.value = true;
}

function onConvertToPatient(lead: Lead) {
  selectedLead.value = lead;
  showConvertToPatientModal.value = true;
}

async function onConvertToPatientSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const leadId = selectedLead.value?.id;
  if (!leadId) { done(false); return; }
  try {
    const res = await apiFetch("/api/v1/patient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, lead_id: leadId }),
    });
    if (res.ok) {
      notifications.show(t("app.patients.form.success"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onInvitePartner(lead: Lead) {
  selectedLead.value = lead;
  showInviteModal.value = true;
}

async function onInviteSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const leadId = selectedLead.value?.id;
  if (!leadId) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/lead/${leadId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.leads.form.inviteSuccess"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

async function onContactSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const leadId = selectedLead.value?.id;
  if (!leadId) { done(false); return; }
  try {
    const ok = await createPractitionerFromLead(data, leadId);
    if (ok) {
      notifications.show(t("user.hcp.form.contactCreated"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onEditLead(lead: Lead) {
  selectedLead.value = lead;
  showEditModal.value = true;
}

async function onLeadEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedLead.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/lead/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.leads.form.editSuccess"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
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

async function onLeadSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  try {
    const res = await apiFetch("/api/v1/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.leads.form.success"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
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

