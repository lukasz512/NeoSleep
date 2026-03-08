<template>
  <div class="view-detail">
    <LeadContactForm
      v-model="showEditModal"
      mode="lead"
      :initial-data="lead ? { name: lead.name, email: lead.email ?? '', status: lead.status, region: lead.region, institution: lead.institution ?? '' } : undefined"
      @submit="onLeadSubmit"
    />
    <LeadContactForm
      v-model="showMoveToContactsModal"
      mode="contact"
      :initial-data="lead ? { name: lead.name, email: lead.email ?? '', region: lead.region, institution: lead.institution ?? '' } : undefined"
      :show-verify-info="true"
      @submit="onContactSubmit"
    />
    <EventForm
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
    :title="lead?.name"
  >
    <template #header-actions v-if="lead">
      <VTooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            color="success"
            class="view-item__schedule-btn"
            :aria-label="t('rep.detail.scheduleVisit')"
            @click="onScheduleVisit"
          >
            <svg class="view-item__schedule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </VBtn>
        </template>
        <span>{{ t('rep.detail.scheduleVisit') }}</span>
      </VTooltip>
      <VTooltip v-if="lead && !isCompleted(lead)" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="view-item__move-to-contacts-btn"
            :aria-label="t('rep.leads.detail.moveToContacts')"
            @click="onMoveToContacts"
          >
            <svg class="view-item__move-to-contacts-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              <path d="M8 20h8M14 18l2 2-2 2" />
            </svg>
          </VBtn>
        </template>
        <span>{{ t('rep.leads.detail.moveToContacts') }}</span>
      </VTooltip>
      <VTooltip v-if="isAdmin" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="view-item__edit-btn view-item__edit-btn--no-border"
            :aria-label="t('rep.leads.detail.edit')"
            @click="onEdit"
          >
            <svg class="view-item__edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </VBtn>
        </template>
        <span>{{ t('rep.leads.detail.edit') }}</span>
      </VTooltip>
    </template>
    <template #title v-if="lead">
      <span class="view-item__title-wrap">
        <GenderIcon :gender="getGenderFromName(lead.name)" />
        <h1 class="view-item__title">{{ lead.name }}</h1>
      </span>
    </template>
    <template #sections v-if="lead">
      <div v-if="!isRejected(lead)" class="view-item__row">
        <dt class="view-item__label">{{ t("rep.leads.detail.email") }}</dt>
        <dd class="view-item__value">
          <a v-if="lead.email" :href="`mailto:${lead.email}`" class="view-item__link">{{ lead.email }}</a>
          <span v-else class="view-item__empty">—</span>
        </dd>
      </div>
      <div v-if="!isRejected(lead) && lead.phone != null" class="view-item__row">
        <dt class="view-item__label">{{ t("rep.leads.detail.phone") }}</dt>
        <dd class="view-item__value">
          <a v-if="lead.phone" :href="`tel:${lead.phone}`" class="view-item__link">{{ lead.phone }}</a>
          <span v-else class="view-item__empty">—</span>
        </dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("rep.leads.detail.status") }}</dt>
        <dd class="view-item__value">
          <span
            :class="['rep-lead-status-chip', `rep-lead-status-chip--${statusClass(lead.status)}`]"
          >
            {{ statusLabel(lead.status) }}
          </span>
        </dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("rep.leads.detail.region") }}</dt>
        <dd class="view-item__value">{{ lead.region || "—" }}</dd>
      </div>
      <div v-if="lead.institution != null" class="view-item__row">
        <dt class="view-item__label">{{ t("rep.leads.detail.institution") }}</dt>
        <dd class="view-item__value">
          <RouterLink
            v-if="lead.institution"
            :to="hcoLink(lead.institution)"
            class="view-item__link"
          >
            {{ lead.institution }}
          </RouterLink>
          <span v-else class="view-item__empty">—</span>
        </dd>
      </div>
    </template>
  </ItemDetailLayout>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { bffFetch } from "../composables/useBffApi";
import { useNotifications } from "../composables/useNotifications";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import LeadContactForm from "../components/LeadContactForm.vue";
import EventForm from "../components/EventForm.vue";
import GenderIcon from "../components/GenderIcon.vue";
import { getGenderFromName } from "../utils/genderFromName";
import type { Lead } from "./LeadsView.vue";

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");

const lead = ref<Lead | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
const showMoveToContactsModal = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string } | undefined>(undefined);

const backRoute = computed(() => ({ name: "leads" }));

const LEAD_STATUS_OPTIONS = ["new", "ongoing", "accepted", "rejected", "completed"] as const;
const STATUS_LABEL_KEYS: Record<string, string> = {
  new: "rep.leads.filters.statusNew",
  ongoing: "rep.leads.filters.statusOngoing",
  accepted: "rep.leads.filters.statusAccepted",
  rejected: "rep.leads.filters.statusRejected",
  completed: "rep.leads.filters.statusCompleted",
};

function statusClass(status: string): "new" | "ongoing" | "accepted" | "rejected" | "completed" {
  const s = (status || "new").toLowerCase();
  return (LEAD_STATUS_OPTIONS as readonly string[]).includes(s) ? (s as "new" | "ongoing" | "accepted" | "rejected" | "completed") : "new";
}

function statusLabel(status: string): string {
  const s = (status || "new").toLowerCase();
  const key = STATUS_LABEL_KEYS[s];
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
  const start = `${date} 09:00`;
  const end = `${date} 10:00`;
  eventFormInitial.value = {
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(payload: import("../components/EventForm.vue").EventSubmitPayload) {
  try {
    const res = await bffFetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        start_at: payload.start_at,
        end_at: payload.end_at,
        type: payload.type,
        status: payload.status,
        location: payload.location,
        video_link: payload.video_link,
        notes: payload.notes,
        region: payload.region,
        attendees: payload.attendees,
      }),
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
  const body = JSON.stringify({
    name: d.name,
    email: d.email || "",
    phone: d.phone || "",
    specialty: d.specialty || undefined,
    region: d.region || undefined,
    institution: d.institution || undefined,
    lead_id: leadId,
  });
  const res = await bffFetch("/api/hcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "rep.leads.errorLoad",
  });
  if (res.ok) {
    const patchRes = await bffFetch(`/api/leads/${leadId}`, {
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
  const body = JSON.stringify({
    name: d.name,
    email: d.email || undefined,
    status: d.status || "new",
    region: d.region || undefined,
    institution: d.institution || undefined,
  });
  const res = await bffFetch(`/api/leads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
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
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  lead.value = null;
  try {
    const res = await bffFetch(`/api/leads/${id}`, { errorMessageKey: "rep.leads.errorLoad" });
    if (res.ok) {
      lead.value = (await res.json()) as Lead;
    }
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

.view-item__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Move to contacts: primary color, no border, 44px touch target */
.view-detail :deep(.view-item__move-to-contacts-btn) {
  min-width: var(--rep-btn-min-width, 44px);
  min-height: var(--rep-btn-min-height, 44px);
  color: rgb(var(--v-theme-primary)) !important;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.12) !important;
  }
}

.view-detail :deep(.view-item__move-to-contacts-icon) {
  width: 24px;
  height: 24px;
  display: block;
  color: rgb(var(--v-theme-primary)) !important;
  stroke: rgb(var(--v-theme-primary)) !important;
}

</style>
