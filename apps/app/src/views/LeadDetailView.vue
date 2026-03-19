<template>
  <div class="view-detail">
    <LeadContactForm
      v-if="showEditModal"
      v-model="showEditModal"
      mode="lead"
      :initial-data="lead ? { name: lead.name, email: lead.email ?? '', status: lead.status, region: lead.region, institution: lead.institution ?? '' } : undefined"
      @submit="onLeadSubmit"
    />
    <LeadContactForm
      v-if="showMoveToContactsModal"
      v-model="showMoveToContactsModal"
      mode="contact"
      :initial-data="lead ? { name: lead.name, email: lead.email ?? '', region: lead.region, institution: lead.institution ?? '' } : undefined"
      :show-verify-info="true"
      @submit="onContactSubmit"
    />
    <EventForm
      v-if="showEventForm"
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />

    <ItemDetailLayout
      :has-content="!!lead"
      :loading="loading"
      :back-route="backRoute"
      :back-label="t('rep.leads.detail.back')"
      :not-found-label="t('rep.leads.detail.notFound')"
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
              class="view-item__schedule-btn" :aria-label="t('rep.detail.scheduleVisit')" @click="onScheduleVisit">
              <svg class="view-item__schedule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </VBtn>
          </template>
          <span>{{ t('rep.detail.scheduleVisit') }}</span>
        </VTooltip>
        <VTooltip v-if="lead && !isCompleted(lead)" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn v-bind="tooltipProps" icon variant="flat" size="large"
              class="view-item__move-to-contacts-btn" :aria-label="t('rep.leads.detail.moveToContacts')" @click="onMoveToContacts">
              <svg class="view-item__move-to-contacts-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M8 20h8M14 18l2 2-2 2" />
              </svg>
            </VBtn>
          </template>
          <span>{{ t('rep.leads.detail.moveToContacts') }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn v-bind="tooltipProps" icon variant="flat" size="large"
              class="view-item__edit-btn view-item__edit-btn--no-border" :aria-label="t('rep.leads.detail.edit')" @click="onEdit">
              <svg class="view-item__edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </VBtn>
          </template>
          <span>{{ t('rep.leads.detail.edit') }}</span>
        </VTooltip>
      </template>

      <!-- Two-column body: data left, map right -->
      <template #body v-if="lead">
        <div class="view-detail__body">

          <!-- Left: data card -->
          <div class="view-detail__card">
            <dl class="view-detail__fields">

              <div v-if="!isRejected(lead)" class="view-detail__row">
                <dt class="view-detail__label">{{ t("rep.leads.detail.email") }}</dt>
                <dd class="view-detail__value">
                  <a v-if="lead.email" :href="`mailto:${lead.email}`" class="view-detail__link">{{ lead.email }}</a>
                  <span v-else class="view-detail__empty">—</span>
                </dd>
              </div>

              <div v-if="!isRejected(lead)" class="view-detail__row">
                <dt class="view-detail__label">{{ t("rep.leads.detail.phone") }}</dt>
                <dd class="view-detail__value">
                  <a v-if="lead.phone" :href="`tel:${lead.phone}`" class="view-detail__link">{{ lead.phone }}</a>
                  <span v-else class="view-detail__empty">—</span>
                </dd>
              </div>

              <div class="view-detail__row">
                <dt class="view-detail__label">{{ t("rep.leads.detail.status") }}</dt>
                <dd class="view-detail__value">
                  <span :class="['rep-lead-status-chip', `rep-lead-status-chip--${leadStatusClass(lead.status)}`]">
                    {{ statusLabel(lead.status) }}
                  </span>
                </dd>
              </div>

              <div class="view-detail__row view-detail__row--chips">
                <dt class="view-detail__label">{{ t("rep.leads.detail.specialty") }}</dt>
                <dd class="view-detail__value view-detail__value--chips">
                  <span
                    v-for="(spec, i) in specialtyChips"
                    :key="spec"
                    :class="['view-detail__specialty-chip', `view-detail__specialty-chip--${SPECIALTY_COLORS[i % SPECIALTY_COLORS.length]}`]"
                  >{{ spec }}</span>
                </dd>
              </div>

              <div class="view-detail__row">
                <dt class="view-detail__label">{{ t("rep.leads.detail.region") }}</dt>
                <dd class="view-detail__value">{{ lead.region || "—" }}</dd>
              </div>

              <div v-if="lead.institution != null" class="view-detail__row">
                <dt class="view-detail__label">{{ t("rep.leads.detail.institution") }}</dt>
                <dd class="view-detail__value">
                  <RouterLink v-if="lead.institution" :to="hcoLink(lead.institution)" class="view-detail__link">
                    {{ lead.institution }}
                  </RouterLink>
                  <span v-else class="view-detail__empty">—</span>
                </dd>
              </div>

              <div class="view-detail__row view-detail__row--notes">
                <dt class="view-detail__label">{{ t("rep.leads.detail.notes") }}</dt>
                <dd class="view-detail__value view-detail__value--notes">{{ lead.notes || demoNotes }}</dd>
              </div>

            </dl>
          </div>

          <!-- Right: map -->
          <div class="view-detail__map-col">
            <iframe
              class="view-detail__map"
              :src="mapUrl"
              title="Location map"
              loading="lazy"
              referrerpolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

        </div>
      </template>

    </ItemDetailLayout>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import GenderIcon from "../components/GenderIcon.vue";
import { getGenderFromName } from "../utils/genderFromName";
import { leadStatusClass, leadStatusI18nKey } from "../utils/leadStatus";
import type { Lead } from "./LeadsView.vue";

const LeadContactForm = defineAsyncComponent(() => import("../components/LeadContactForm.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");

// ---------------------------------------------------------------------------
// Demo enrichment data
// ---------------------------------------------------------------------------
const DEMO_SPECIALTIES: Record<string, string> = {
  "City Hospital North": "Pulmonology & Sleep Medicine",
  "Clinic Central": "ENT & Sleep-Disordered Breathing",
  "Medical Center Alpha": "Internal Medicine",
  "Warsaw Medical Center": "Otolaryngology",
  "Hospital East": "Pulmonology",
  "Sleep Clinic West": "Sleep Medicine",
};

const DEMO_NOTES: Record<string, string> = {
  "City Hospital North": "Interested in NeoSleep protocol for post-op patients. Follow up after Q1 conference.",
  "Clinic Central": "Attended the OrthApnea webinar. Requested clinical evidence deck. High potential.",
  "Medical Center Alpha": "Initial contact made via email. Waiting for call-back. Referred by Dr. Nowak.",
};

const SPECIALTY_COLORS = ["teal", "violet", "amber", "blue", "green", "indigo"];

const demoSpecialty = computed(() =>
  DEMO_SPECIALTIES[lead.value?.institution ?? ""] ?? "General Medicine"
);

const demoNotes = computed(() =>
  DEMO_NOTES[lead.value?.institution ?? ""] ?? "No notes yet."
);

const specialtyChips = computed(() => {
  const raw = lead.value?.specialty || demoSpecialty.value;
  return raw.split(/[&,]/).map((s) => s.trim()).filter(Boolean);
});

const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  North:   { lat: 52.27, lng: 20.97 },
  Central: { lat: 52.23, lng: 21.01 },
  South:   { lat: 52.17, lng: 21.03 },
  East:    { lat: 52.24, lng: 21.09 },
  West:    { lat: 52.22, lng: 20.92 },
};

const mapUrl = computed(() => {
  const coords = REGION_COORDS[lead.value?.region ?? ""] ?? REGION_COORDS["Central"];
  const d = 0.018;
  const bbox = `${coords.lng - d},${coords.lat - d},${coords.lng + d},${coords.lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat},${coords.lng}`;
});

// ---------------------------------------------------------------------------
// Core state
// ---------------------------------------------------------------------------
const lead = ref<Lead | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
const showMoveToContactsModal = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string } | undefined>(undefined);

const backRoute = computed(() => ({ name: "leads" }));

function statusLabel(status: string): string {
  const key = leadStatusI18nKey(status);
  return key ? t(key) : status || t("rep.leads.filters.statusNew");
}

function isRejected(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "rejected";
}

function isCompleted(lead: Lead): boolean {
  return (lead.status || "").toLowerCase() === "completed";
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
    const res = await apiFetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: payload.title, start_at: payload.start_at, end_at: payload.end_at, type: payload.type, status: payload.status, location: payload.location, video_link: payload.video_link, notes: payload.notes, region: payload.region, attendees: payload.attendees }),
    });
    if (res.ok) {
      notifications.show(t("rep.planner.form.success"), "success");
      showEventForm.value = false;
    } else {
      notifications.show(t("rep.planner.form.errorSave"), "error");
    }
  } catch {
    notifications.show(t("rep.planner.form.errorSave"), "error");
  }
}

function onMoveToContacts() {
  showMoveToContactsModal.value = true;
}

async function onContactSubmit(data: import("../components/LeadContactForm.vue").LeadFormData | import("../components/LeadContactForm.vue").ContactFormData) {
  const d = data as import("../components/LeadContactForm.vue").ContactFormData;
  const leadId = lead.value?.id;
  if (!leadId) return;
  const res = await apiFetch("/api/hcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: d.name, email: d.email || "", phone: d.phone || "", specialty: d.specialty || undefined, region: d.region || undefined, institution: d.institution || undefined, lead_id: leadId }),
    errorMessageKey: "rep.leads.errorLoad",
  });
  if (res.ok) {
    const patchRes = await apiFetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
      errorMessageKey: "rep.leads.errorLoad",
    });
    if (patchRes.ok) {
      notifications.show(t("rep.hcp.form.contactCreated"), "success");
      showMoveToContactsModal.value = false;
      await loadLead();
      window.dispatchEvent(new Event("rep-entity-list-refresh"));
    }
  }
}

function hcoLink(institutionName: string) {
  return { path: "/hco", query: { institution: institutionName } };
}

function onEdit() {
  showEditModal.value = true;
}

async function onLeadSubmit(data: import("../components/LeadContactForm.vue").LeadFormData | import("../components/LeadContactForm.vue").ContactFormData) {
  const d = data as import("../components/LeadContactForm.vue").LeadFormData;
  const id = lead.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/leads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: d.name, email: d.email || undefined, status: d.status || "new", region: d.region || undefined, institution: d.institution || undefined }),
    errorMessageKey: "rep.leads.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("rep.leads.form.editSuccess"), "success");
    showEditModal.value = false;
    await loadLead();
    window.dispatchEvent(new Event("rep-entity-list-refresh"));
  }
}

async function loadLead() {
  const id = route.params.id as string;
  if (!id) { loading.value = false; return; }
  loading.value = true;
  lead.value = null;
  try {
    const res = await apiFetch(`/api/leads/${id}`, { errorMessageKey: "rep.leads.errorLoad" });
    if (res.ok) lead.value = (await res.json()) as Lead;
  } catch {
    lead.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadLead);
watch(() => route.params.id, loadLead);
</script>

<style lang="scss" scoped>
.view-detail {
  min-height: 0;
}

// Header name
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

// Two-column body
.view-detail__body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;

  @media (min-width: 700px) {
    grid-template-columns: 1fr 320px;
    align-items: stretch;
  }
}

// Data card
.view-detail__card {
  padding: 24px;
  border-radius: var(--rep-radius);
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

.view-detail__row--chips {
  align-items: start;
}

.view-detail__value--chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

// Specialty chips
.view-detail__specialty-chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 500;

  &--teal   { background: rgba(18, 143, 131, 0.12); color: #0d7a70; }
  &--violet { background: rgba(139, 92, 246, 0.12); color: #7c3aed; }
  &--amber  { background: rgba(245, 158, 11, 0.12); color: #b45309; }
  &--blue   { background: rgba(59, 130, 246, 0.12); color: #1d4ed8; }
  &--green  { background: rgba(34, 197, 94, 0.12);  color: #15803d; }
  &--indigo { background: rgba(99, 102, 241, 0.12); color: #4338ca; }
}

// Map column
.view-detail__map-col {
  display: flex;
  min-height: 260px;
}

.view-detail__map {
  width: 100%;
  height: 300px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--rep-radius, 8px);
  display: block;

  @media (min-width: 700px) {
    height: 100%;
  }
}

// Buttons (delegated to ItemDetailLayout deep)
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
</style>
