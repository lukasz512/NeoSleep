<template>
  <div class="view-detail">
    <FormRenderer
      v-model="showEditModal"
      :fields="leadFormFields"
      :initial-data="lead ?? undefined"
      title-key="user.leads.form.title"
      edit-title-key="user.leads.form.editTitle"
      submit-label-key="user.leads.form.submit"
      edit-submit-label-key="user.leads.form.editSubmit"
      avatar-entity-type="lead"
      @submit="onLeadSubmit"
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

    <VAlert
      v-if="isOffline"
      type="warning"
      variant="tonal"
      density="compact"
      class="view-detail__offline-banner"
      :text="t('app.common.offlineShowingCached')"
    />
    <ItemDetailLayout
      :has-content="!!lead"
      :loading="loading"
      :load-error="loadFailed"
      :back-route="backRoute"
      :back-label="t('user.leads.detail.back')"
      :not-found-label="t('user.leads.detail.notFound')"
      @retry="loadLead"
    >
      <!-- Name inline with back arrow -->
      <template #header-title v-if="lead">
        <span class="view-detail__header-name-wrap">
          <AppAvatar :name="lead.name" entity-type="lead" :size="32" />
          <h1 class="view-detail__header-name">{{ lead.name }}</h1>
        </span>
      </template>

      <!-- Actions on the right -->
      <template #header-actions v-if="lead">
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton v-bind="tooltipProps" icon variant="flat" size="large"
              :class="entityActionBtnClass('scheduleVisit')" :aria-label="t('user.detail.scheduleVisit')" @click="onScheduleVisit">
              <AppIcon :name="entityActionIcon('scheduleVisit')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.detail.scheduleVisit') }}</span>
        </VTooltip>
        <VTooltip v-if="lead && lead.type === 'doctor' && !isConverted(lead)" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton v-bind="tooltipProps" icon variant="flat" size="large"
              :class="entityActionBtnClass('moveToContacts')" :aria-label="t('user.leads.detail.moveToContacts')" @click="onMoveToContacts">
              <AppIcon :name="entityActionIcon('moveToContacts')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.leads.detail.moveToContacts') }}</span>
        </VTooltip>
        <VTooltip v-if="lead && lead.type === 'patient' && !isConverted(lead)" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton v-bind="tooltipProps" icon variant="flat" size="large"
              :class="entityActionBtnClass('convertToPatient')" :aria-label="t('user.leads.detail.convertToPatient')" @click="onConvertToPatient">
              <AppIcon :name="entityActionIcon('convertToPatient')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.leads.detail.convertToPatient') }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton v-bind="tooltipProps" icon variant="flat" size="large"
              :class="entityActionBtnClass('edit')" :aria-label="t('user.leads.detail.edit')" @click="onEdit">
              <AppIcon :name="entityActionIcon('edit')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.leads.detail.edit') }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('delete')"
              :aria-label="t('user.leads.actions.delete')"
              @click="showDeleteConfirm = true"
            >
              <AppIcon :name="entityActionIcon('delete')" class="view-item__action-icon" />
            </AppButton>
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

              <div class="view-detail__row">
                <dt class="view-detail__label">{{ t("user.leads.detail.institution") }}</dt>
                <dd class="view-detail__value">
                  <RouterLink v-if="leadInstitution(lead)" :to="hcoLink(leadInstitution(lead))" class="view-detail__link view-detail__institution-link">
                    <AppIcon name="nav-hco" class="view-detail__institution-icon" />
                    {{ leadInstitution(lead) }}
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

    <VDialog v-model="showDeleteConfirm" max-width="360" :transition="originDialogTransition" persistent>
      <VCard>
        <VCardText>{{ t("user.leads.actions.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDeleteConfirm = false">
            {{ t("app.common.cancel") }}
          </AppButton>
          <AppButton color="error" variant="text" :loading="deleteLoading" @click="onDelete">
            {{ t("user.leads.actions.delete") }}
          </AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { originDialogTransition } from "@ui";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { apiFetch } from "../composables/useBffApi";
import { useEntityCacheStore } from "../stores/entityCache";
import { useNotifications } from "../composables/useNotifications";
import { useAsyncAction } from "../composables/useAsyncAction";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppAvatar from "../components/AppAvatar.vue";
import GenderIcon from "../components/GenderIcon.vue";
import { getGenderFromName } from "../utils/genderFromName";
import { leadStatusClass, leadStatusI18nKey, leadInstitution } from "../utils/leadStatus";
import { leadFormFields } from "../config/forms/leadForm";
import { hcpFormFields, hcpFormDerive } from "../config/forms/hcpForm";
import { patientFormFields } from "../config/forms/patientForm";
import { createPractitionerFromLead } from "../utils/leadConversion";
import { entityActionIcon, entityActionBtnClass } from "../config/entityActions";
import type { Lead } from "./LeadsView.vue";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
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
const leadCache = useEntityCacheStore("leads");
const lead = ref<Lead | null>(null);
const loading = ref(true);
/** True while `lead` is being served from the offline cache — see docs/ADR-013-offline-read-cache.md. */
const isOffline = ref(false);
/** True when loadLead() failed for a reason other than a genuine 404 (network/server) — see loadLead(). */
const loadFailed = ref(false);
const showEditModal = ref(false);
const showMoveToContactsModal = ref(false);
const showConvertToPatientModal = ref(false);
const showEventForm = ref(false);
const showDeleteConfirm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string } | undefined>(undefined);

/**
 * Stable reference (see hcpFormInitialData in HCPDetailView.vue) — an inline
 * object literal in the template would get a new identity on every re-render,
 * which resets FormRenderer's open form and dirty snapshot together and
 * silently defeats the discard-changes confirmation.
 */
const moveToContactsInitialData = computed(() => (lead.value ? {
  salutation: lead.value.salutation ?? "",
  first_name: lead.value.first_name,
  last_name: lead.value.last_name,
  email: lead.value.email ?? "",
  phone: lead.value.phone ?? "",
  // Pre-fills the clinic combobox with the lead's own institution name —
  // isCreatingNewOrganization() resolves it against the loaded clinic list
  // once options finish loading (see hcpForm.ts).
  organization_id: leadInstitution(lead.value),
} : undefined));

/** Same stable-reference rationale as moveToContactsInitialData above. */
const convertToPatientInitialData = computed(() => (lead.value ? {
  salutation: lead.value.salutation ?? "",
  first_name: lead.value.first_name,
  last_name: lead.value.last_name,
  email: lead.value.email ?? "",
  phone: lead.value.phone ?? "",
  region: lead.value.region,
} : undefined));

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

function onMoveToContacts() {
  showMoveToContactsModal.value = true;
}

async function onContactSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const leadId = lead.value?.id;
  if (!leadId) { done(false); return; }
  // Conversion (status -> converted, converted_to_id/type/at) now happens
  // atomically server-side via ConvertLeadCommand when lead_id is present —
  // no separate PATCH needed here anymore. createPractitionerFromLead()
  // additionally creates the clinic first when the rep typed a new one
  // (see hcpForm.ts's isCreatingNewOrganization()).
  try {
    const ok = await createPractitionerFromLead(data, leadId);
    if (ok) {
      notifications.show(t("user.hcp.form.contactCreated"), "success");
      await loadLead();
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onConvertToPatient() {
  showConvertToPatientModal.value = true;
}

async function onConvertToPatientSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const leadId = lead.value?.id;
  if (!leadId) { done(false); return; }
  // Conversion (status -> converted, converted_to_id/type/at) happens
  // atomically server-side via ConvertLeadCommand when lead_id is present —
  // same pattern as onContactSubmit's Lead->Practitioner conversion above.
  try {
    const res = await apiFetch("/api/v1/patient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, lead_id: leadId }),
    });
    if (res.ok) {
      notifications.show(t("app.patients.form.success"), "success");
      await loadLead();
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function hcoLink(institutionName: string) {
  return { path: "/hco", query: { institution: institutionName } };
}

function onEdit() {
  showEditModal.value = true;
}

async function onLeadSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = lead.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/lead/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.leads.form.editSuccess"), "success");
      await loadLead();
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = lead.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/lead/${id}`, {
    method: "DELETE",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.leads.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "leads" });
  }
});

async function loadLead() {
  const id = route.params.id as string;
  if (!id) { loading.value = false; return; }
  loading.value = true;
  lead.value = null;
  loadFailed.value = false;
  try {
    const res = await apiFetch(`/api/v1/lead/${id}`, { handleErrors: false });
    if (res.ok) {
      lead.value = (await res.json()) as Lead;
      isOffline.value = false;
      void leadCache.cacheOne(lead.value as unknown as Record<string, unknown>);
    } else if (res.status !== 404) {
      // Not a genuine 404 — ItemDetailLayout renders its own "connection
      // problem" + retry state for this (see :load-error), so no separate
      // toast on top of it.
      loadFailed.value = true;
    }
  } catch {
    // Network failure, not a server error — fall back to the cached record if we have one.
    const cached = await leadCache.readOne(id);
    if (cached) {
      lead.value = cached as unknown as Lead;
      isOffline.value = true;
    } else {
      loadFailed.value = true;
      lead.value = null;
    }
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

.view-detail__offline-banner {
  margin: 0 0 12px;
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

.view-detail__institution-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.view-detail__institution-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.view-detail__empty {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}
</style>
