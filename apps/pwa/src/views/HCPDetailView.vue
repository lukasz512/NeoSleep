<template>
  <div class="view-detail">
    <EventForm
      v-if="showEventForm"
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <LeadContactForm
      v-if="showEditModal"
      v-model="showEditModal"
      mode="contact"
      :initial-data="hcp ? { name: hcp.name, email: hcp.email ?? '', phone: (hcp.phone ?? '').replace(/^\+\d+/, ''), specialty: hcp.specialty ?? '', region: hcp.region ?? '', institution: hcp.institution ?? '' } : undefined"
      @submit="onContactSubmit"
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
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import GenderIcon from "../components/GenderIcon.vue";
import { getGenderFromName } from "../utils/genderFromName";

const LeadContactForm = defineAsyncComponent(() => import("../components/LeadContactForm.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

interface HCP {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
  institution?: string;
  region?: string;
}

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");

const hcp = ref<HCP | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
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

async function onContactSubmit(data: import("../components/LeadContactForm.vue").LeadFormData | import("../components/LeadContactForm.vue").ContactFormData) {
  const d = data as import("../components/LeadContactForm.vue").ContactFormData;
  const id = hcp.value?.id;
  if (!id) return;
  const body = JSON.stringify({
    name: d.name,
    email: d.email,
    phone: d.phone ? `+52${d.phone.replace(/\D/g, "")}` : undefined,
    specialty: d.specialty || undefined,
    region: d.region || undefined,
    institution: d.institution || undefined,
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

async function loadHCP() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  hcp.value = null;
  try {
    const res = await apiFetch(`/api/v1/practitioner/${id}`, { errorMessageKey: "user.hcp.errorLoad" });
    if (res.ok) {
      hcp.value = (await res.json()) as HCP;
    }
  } catch {
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
</style>
