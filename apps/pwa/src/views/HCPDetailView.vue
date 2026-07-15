<template>
  <div class="view-detail">
    <EventForm
      v-if="showEventForm"
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <PractitionerForm
      v-if="showEditModal"
      v-model="showEditModal"
      :initial-data="hcp ? {
        id: hcp.id,
        salutation: hcp.salutation ?? '',
        first_name: hcp.first_name ?? '',
        last_name: hcp.last_name ?? '',
        email: hcp.email ?? '',
        phone: (hcp.phone ?? '').replace(/^\+\d+/, ''),
        primary_specialty: hcp.primary_specialty ?? hcp.specialty ?? '',
        region: hcp.region ?? '',
        institution: hcp.institution ?? '',
        influence_tier: hcp.influence_tier ?? 'C',
        language: hcp.language ?? '',
        national_ids: hcp.national_ids ?? null,
      } : undefined"
      @submit="onContactSubmit"
    />
    <ConfirmDialog
      v-model="showDeleteConfirm"
      :message="t('user.hcp.actions.deleteConfirmText')"
      :confirm-label="t('user.hcp.actions.delete')"
      :cancel-label="t('app.common.cancel')"
      @confirm="onDelete"
      @cancel="showDeleteConfirm = false"
    />
    <ItemDetailLayout
    :has-content="!!hcp"
    :loading="loading"
    :back-route="{ name: 'hcp' }"
    :back-label="t('user.hcp.detail.back')"
    :not-found-label="t('user.hcp.detail.notFound')"
    :title="hcp?.name"
  >
    <template #header-actions v-if="hcp">
      <VTooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            color="success"
            class="view-item__schedule-btn"
            :aria-label="t('user.detail.scheduleVisit')"
            @click="onScheduleVisit"
          >
            <AppIcon name="calendar" class="view-item__schedule-icon" />
          </VBtn>
        </template>
        <span>{{ t('user.detail.scheduleVisit') }}</span>
      </VTooltip>
      <VTooltip v-if="isAdmin" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="view-item__edit-btn view-item__edit-btn--no-border"
            :aria-label="t('user.hcp.detail.edit')"
            @click="onEdit"
          >
            <AppIcon name="pencil" class="view-item__edit-icon" />
          </VBtn>
        </template>
        <span>{{ t('user.hcp.detail.edit') }}</span>
      </VTooltip>
      <VTooltip v-if="isAdmin" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="view-item__delete-btn view-item__delete-btn--no-border"
            :aria-label="t('user.hcp.actions.delete')"
            @click="showDeleteConfirm = true"
          >
            <AppIcon name="trash" class="view-item__delete-icon" />
          </VBtn>
        </template>
        <span>{{ t('user.hcp.actions.delete') }}</span>
      </VTooltip>
    </template>
    <template #title v-if="hcp">
      <span class="view-item__title-wrap">
        <GenderIcon :gender="getGenderFromName(hcp.name)" />
        <h1 class="view-item__title">{{ hcp.name }}</h1>
      </span>
    </template>
    <template #sections v-if="hcp">
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hcp.detail.email") }}</dt>
        <dd class="view-item__value">
          <a v-if="hcp.email" :href="`mailto:${hcp.email}`" class="view-item__link">{{ hcp.email }}</a>
          <span v-else class="view-item__empty">—</span>
        </dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hcp.detail.specialty") }}</dt>
        <dd class="view-item__value">{{ hcp.specialty || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hcp.detail.institution") }}</dt>
        <dd class="view-item__value">{{ hcp.institution || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hcp.detail.region") }}</dt>
        <dd class="view-item__value">{{ hcp.region || "—" }}</dd>
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

const PractitionerForm = defineAsyncComponent(() => import("../components/PractitionerForm.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

interface HCP {
  id: string;
  name: string;
  salutation?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  specialty?: string;
  primary_specialty?: string;
  institution?: string;
  region?: string;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");

const hcp = ref<HCP | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string; hcpIds?: string[] } | undefined>(undefined);

function onScheduleVisit() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = `${date} 09:00`;
  const end = `${date} 10:00`;
  eventFormInitial.value = {
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    hcpIds: hcp.value?.id ? [hcp.value.id] : [],
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(payload: import("../components/EventForm.vue").EventSubmitPayload) {
  try {
    const res = await apiFetch("/api/v1/encounter", {
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
      notifications.show(t("user.planner.form.success"), "success");
      showEventForm.value = false;
    } else {
      notifications.show(t("user.planner.form.errorSave"), "error");
    }
  } catch {
    notifications.show(t("user.planner.form.errorSave"), "error");
  }
}

function onEdit() {
  showEditModal.value = true;
}

async function onContactSubmit(data: import("../components/PractitionerForm.vue").PractitionerSubmitPayload) {
  const id = hcp.value?.id;
  if (!id) return;
  const body = JSON.stringify({
    salutation: data.salutation,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone ? `+52${data.phone.replace(/\D/g, "")}` : undefined,
    primary_specialty: data.primary_specialty,
    region: data.region,
    institution: data.institution,
    influence_tier: data.influence_tier,
    language: data.language,
    national_ids: data.national_ids,
  });
  const res = await apiFetch(`/api/v1/practitioner/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "user.hcp.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.hcp.form.editSuccess"), "success");
    showEditModal.value = false;
    await loadHCP();
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}

async function onDelete() {
  const id = hcp.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/practitioner/${id}`, {
    method: "DELETE",
    errorMessageKey: "user.hcp.errorLoad",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.hcp.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "hcp" });
  }
}

async function loadHCP() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  hcp.value = null;
  try {
    const res = await apiFetch(`/api/v1/practitioner/${id}`, { handleErrors: false });
    if (res.ok) {
      hcp.value = (await res.json()) as HCP;
    } else if (res.status !== 404) {
      notifications.show(t("user.hcp.errorLoad"), "error");
    }
  } catch {
    notifications.show(t("user.hcp.errorLoad"), "error");
    hcp.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadHCP);
watch(() => route.params.id, loadHCP);
</script>

<style scoped>
.view-detail {
  min-height: 0;
}

.view-item__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
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
