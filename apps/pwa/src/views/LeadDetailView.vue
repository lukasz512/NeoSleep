<template>
  <div class="view-detail">
    <LeadForm
      v-if="showEditModal"
      v-model="showEditModal"
      :initial-data="lead ? { id: lead.id, salutation: lead.salutation ?? '', first_name: lead.first_name, last_name: lead.last_name, email: lead.email ?? '', phone: lead.phone ?? '', status: lead.status, region: lead.region, institution: lead.institution ?? '' } : undefined"
      @submit="onLeadSubmit"
    />
    <PractitionerForm
      v-if="showMoveToContactsModal"
      v-model="showMoveToContactsModal"
      :initial-data="lead ? { salutation: lead.salutation ?? '', first_name: lead.first_name, last_name: lead.last_name, email: lead.email ?? '', phone: lead.phone ?? '', region: lead.region, institution: lead.institution ?? '' } : undefined"
      :show-verify-info="true"
      @submit="onContactSubmit"
    />
    <PatientForm
      v-if="showConvertToPatientModal"
      v-model="showConvertToPatientModal"
      :initial-data="lead ? { salutation: lead.salutation ?? '', first_name: lead.first_name, last_name: lead.last_name, email: lead.email ?? '', phone: lead.phone ?? '', region: lead.region } : undefined"
      @submit="onConvertToPatientSubmit"
    />
    <EventForm
      v-if="showEventForm"
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <ConfirmDialog
      v-model="showDeleteConfirm"
      :message="t('user.leads.actions.deleteConfirmText')"
      :confirm-label="t('user.leads.actions.delete')"
      :cancel-label="t('app.common.cancel')"
      @confirm="onDelete"
      @cancel="showDeleteConfirm = false"
    />

    <ItemDetailLayout
      :has-content="!!lead"
      :loading="loading"
      :back-route="backRoute"
      :back-label="t('user.leads.detail.back')"
      :not-found-label="t('user.leads.detail.notFound')"
    >
      <!-- Name inline with back arrow -->
      <template #header-title v-if="lead">
        <h1 class="view-detail__header-name">{{ lead.name }}</h1>
      </template>

      <!-- Actions on the right -->
      <template #header-actions v-if="lead">
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn v-bind="tooltipProps" icon variant="flat" size="large" color="success"
              class="view-item__schedule-btn" :aria-label="t('user.detail.scheduleVisit')" @click="onScheduleVisit">
              <AppIcon name="calendar" class="view-item__schedule-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.detail.scheduleVisit') }}</span>
        </VTooltip>
        <VTooltip v-if="lead && !isConverted(lead)" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn v-bind="tooltipProps" icon variant="flat" size="large"
              class="view-item__move-to-contacts-btn" :aria-label="t('user.leads.detail.moveToContacts')" @click="onMoveToContacts">
              <AppIcon name="user-arrow" class="view-item__move-to-contacts-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.leads.detail.moveToContacts') }}</span>
        </VTooltip>
        <VTooltip v-if="lead && !isConverted(lead)" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn v-bind="tooltipProps" icon variant="flat" size="large"
              class="view-item__move-to-contacts-btn" :aria-label="t('user.leads.detail.convertToPatient')" @click="onConvertToPatient">
              <AppIcon name="nav-patients" class="view-item__move-to-contacts-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.leads.detail.convertToPatient') }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn v-bind="tooltipProps" icon variant="flat" size="large"
              class="view-item__edit-btn view-item__edit-btn--no-border" :aria-label="t('user.leads.detail.edit')" @click="onEdit">
              <AppIcon name="pencil" class="view-item__edit-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.leads.detail.edit') }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn v-bind="tooltipProps" icon variant="flat" size="large"
              class="view-item__delete-btn view-item__delete-btn--no-border" :aria-label="t('user.leads.actions.delete')" @click="showDeleteConfirm = true">
              <AppIcon name="trash" class="view-item__delete-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.leads.actions.delete') }}</span>
        </VTooltip>
      </template>

      <template #body v-if="lead">
        <div class="view-detail__body">

          <!-- Data card -->
          <div class="view-detail__card">
            <dl class="view-detail__fields">

              <div v-if="!isInactive(lead)" class="view-detail__row">
                <dt class="view-detail__label">{{ t("user.leads.detail.email") }}</dt>
                <dd class="view-detail__value">
                  <a v-if="lead.email" :href="`mailto:${lead.email}`" class="view-detail__link">{{ lead.email }}</a>
                  <span v-else class="view-detail__empty">—</span>
                </dd>
              </div>

              <div v-if="!isInactive(lead)" class="view-detail__row">
                <dt class="view-detail__label">{{ t("user.leads.detail.phone") }}</dt>
                <dd class="view-detail__value">
                  <a v-if="lead.phone" :href="`tel:${lead.phone}`" class="view-detail__link">{{ lead.phone }}</a>
                  <span v-else class="view-detail__empty">—</span>
                </dd>
              </div>

              <div class="view-detail__row">
                <dt class="view-detail__label">{{ t("user.leads.detail.status") }}</dt>
                <dd class="view-detail__value">
                  <span :class="['pwa-lead-status-chip', `pwa-lead-status-chip--${leadStatusClass(lead.status)}`]">
                    {{ statusLabel(lead.status) }}
                  </span>
                </dd>
              </div>

              <div class="view-detail__row">
                <dt class="view-detail__label">{{ t("user.leads.detail.region") }}</dt>
                <dd class="view-detail__value">{{ lead.region || "—" }}</dd>
              </div>

              <div v-if="lead.institution != null" class="view-detail__row">
                <dt class="view-detail__label">{{ t("user.leads.detail.institution") }}</dt>
                <dd class="view-detail__value">
                  <RouterLink v-if="lead.institution" :to="hcoLink(lead.institution)" class="view-detail__link">
                    {{ lead.institution }}
                  </RouterLink>
                  <span v-else class="view-detail__empty">—</span>
                </dd>
              </div>

              <div class="view-detail__row view-detail__row--notes">
                <dt class="view-detail__label">{{ t("user.leads.detail.notes") }}</dt>
                <dd class="view-detail__value view-detail__value--notes">
                  <span v-if="lead.notes">{{ lead.notes }}</span>
                  <span v-else class="view-detail__empty">—</span>
                </dd>
              </div>

            </dl>
          </div>

        </div>
      </template>

    </ItemDetailLayout>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import AppIcon from "../components/AppIcon.vue";
import GenderIcon from "../components/GenderIcon.vue";
import { getGenderFromName } from "../utils/genderFromName";
import { leadStatusClass, leadStatusI18nKey } from "../utils/leadStatus";
import type { Lead } from "./LeadsView.vue";

const LeadForm = defineAsyncComponent(() => import("../components/LeadForm.vue"));
const PractitionerForm = defineAsyncComponent(() => import("../components/PractitionerForm.vue"));
const PatientForm = defineAsyncComponent(() => import("../components/PatientForm.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const authStore = useAuthStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");

// ---------------------------------------------------------------------------
// Core state
// ---------------------------------------------------------------------------
const lead = ref<Lead | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
const showMoveToContactsModal = ref(false);
const showConvertToPatientModal = ref(false);
const showDeleteConfirm = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string } | undefined>(undefined);

const backRoute = computed(() => ({ name: "leads" }));

function statusLabel(status: string): string {
  const key = leadStatusI18nKey(status);
  return key ? t(key) : status || t("user.leads.filters.statusNew");
}

function isInactive(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "inactive";
}

function isConverted(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "converted";
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

async function onEventFormSubmit(payload: import("../components/EventForm.vue").EventSubmitPayload) {
  try {
    const res = await apiFetch("/api/v1/encounter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: payload.title, start_at: payload.start_at, end_at: payload.end_at, type: payload.type, status: payload.status, location: payload.location, video_link: payload.video_link, notes: payload.notes, region: payload.region, attendees: payload.attendees }),
    });
    if (res.ok) {
      notifications.show(t("user.planner.form.success"), "success");
      showEventForm.value = false;
    } else {
      notifications.show(t("user.planner.form.errorSave"), "error");
    }
  } catch {
    notifications.show(t("user.planner.form.errorSave"), "error");
  }
}

function onMoveToContacts() {
  showMoveToContactsModal.value = true;
}

async function onContactSubmit(data: import("../components/PractitionerForm.vue").PractitionerSubmitPayload) {
  const leadId = lead.value?.id;
  if (!leadId) return;
  // Conversion (status -> converted, converted_to_id/type/at) now happens
  // atomically server-side via ConvertLeadCommand when lead_id is present —
  // no separate PATCH needed here anymore.
  const res = await apiFetch("/api/v1/practitioner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      salutation: data.salutation,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      primary_specialty: data.primary_specialty,
      region: data.region,
      institution: data.institution,
      influence_tier: data.influence_tier,
      language: data.language,
      national_ids: data.national_ids,
      lead_id: leadId,
    }),
    errorMessageKey: "user.leads.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.hcp.form.contactCreated"), "success");
    showMoveToContactsModal.value = false;
    await loadLead();
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}

function onConvertToPatient() {
  showConvertToPatientModal.value = true;
}

async function onConvertToPatientSubmit(data: import("../components/PatientForm.vue").PatientSubmitPayload) {
  const leadId = lead.value?.id;
  if (!leadId) return;
  // Conversion (status -> converted, converted_to_id/type/at) happens
  // atomically server-side via ConvertLeadCommand when lead_id is present —
  // same pattern as onContactSubmit's Lead->Practitioner conversion above.
  const res = await apiFetch("/api/v1/patient", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      salutation: data.salutation,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      region: data.region,
      lead_id: leadId,
    }),
    errorMessageKey: "user.leads.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("app.patients.form.success"), "success");
    showConvertToPatientModal.value = false;
    await loadLead();
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}

function hcoLink(institutionName: string) {
  return { path: "/hco", query: { institution: institutionName } };
}

function onEdit() {
  showEditModal.value = true;
}

async function onLeadSubmit(data: import("../components/LeadForm.vue").LeadSubmitPayload) {
  const id = lead.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/lead/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      salutation: data.salutation,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      status: data.status || "new",
      region: data.region,
      institution: data.institution,
    }),
    errorMessageKey: "user.leads.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.leads.form.editSuccess"), "success");
    showEditModal.value = false;
    await loadLead();
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}

async function onDelete() {
  const id = lead.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/lead/${id}`, {
    method: "DELETE",
    errorMessageKey: "user.leads.errorLoad",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.leads.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "leads" });
  }
}

async function loadLead() {
  const id = route.params.id as string;
  if (!id) { loading.value = false; return; }
  loading.value = true;
  lead.value = null;
  try {
    const res = await apiFetch(`/api/v1/lead/${id}`, { handleErrors: false });
    if (res.ok) {
      lead.value = (await res.json()) as Lead;
    } else if (res.status !== 404) {
      notifications.show(t("user.leads.errorLoad"), "error");
    }
  } catch {
    notifications.show(t("user.leads.errorLoad"), "error");
    lead.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadLead);
watch(() => route.params.id, loadLead);
</script>

<style scoped>
.view-detail {
  min-height: 0;
}

/* Header name */
.view-detail__header-name-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-detail__header-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-detail__body {
  display: grid;
  grid-template-columns: 1fr;
  align-items: stretch;
  gap: 16px;
}

/* Data card */
.view-detail__card {
  padding: 24px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-surface), 1);
}

.view-detail__fields {
  margin: 0;
  display: grid;
  gap: 14px;
}

.view-detail__row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  align-items: baseline;
}

.view-detail__row--notes {
  align-items: start;
}

.view-detail__label {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-detail__value {
  margin: 0;
  font-size: 0.9375rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-detail__value--notes {
  font-style: italic;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  line-height: 1.5;
}

.view-detail__link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  &:hover { text-decoration: underline; }
}

.view-detail__empty {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

/* Buttons (delegated to ItemDetailLayout deep) */
.view-detail :deep(.view-item__move-to-contacts-btn) {
  min-width: 44px; min-height: 44px;
  color: rgb(var(--v-theme-primary)) !important;
  border: none !important; box-shadow: none !important; background: transparent !important;
  &:hover { background: rgba(var(--v-theme-primary), 0.12) !important; }
}
.view-detail :deep(.view-item__move-to-contacts-icon) {
  width: 24px; height: 24px; display: block;
  color: rgb(var(--v-theme-primary)) !important;
  stroke: rgb(var(--v-theme-primary)) !important;
}

.view-detail :deep(.view-item__delete-btn) {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
  color: rgb(var(--v-theme-error)) !important;
}

.view-detail :deep(.view-item__delete-btn--no-border) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;

  &:hover {
    background: rgba(var(--v-theme-error), 0.12) !important;
  }
}

.view-detail :deep(.view-item__delete-icon) {
  width: 22px;
  height: 22px;
  display: block;
  color: rgb(var(--v-theme-error)) !important;
  stroke: rgb(var(--v-theme-error)) !important;
}
</style>
