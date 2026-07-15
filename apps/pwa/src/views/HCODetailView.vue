<template>
  <div class="view-detail">
    <EventForm
      v-if="showEventForm"
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <OrganizationForm
      v-if="showEditModal"
      v-model="showEditModal"
      :initial-data="hco ? {
        id: hco.id,
        name: hco.name ?? '',
        type: hco.type ?? '',
        status: hco.status ?? '',
        region: hco.region ?? '',
        address_line1: hco.address_line1 ?? '',
        city: hco.city ?? '',
        state: hco.state ?? '',
        postal_code: hco.postal_code ?? '',
        country_code: hco.country_code ?? '',
        phone: hco.phone ?? '',
        email: hco.email ?? '',
        website: hco.website ?? '',
      } : undefined"
      @submit="onAccountSubmit"
    />
    <ItemDetailLayout
    :has-content="!!hco"
    :loading="loading"
    :back-route="{ name: 'hco' }"
    :back-label="t('user.hco.detail.back')"
    :not-found-label="t('user.hco.detail.notFound')"
    :title="hco?.name"
  >
    <template #header-actions v-if="hco">
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
            :aria-label="t('user.hco.detail.edit')"
            @click="onEdit"
          >
            <AppIcon name="pencil" class="view-item__edit-icon" />
          </VBtn>
        </template>
        <span>{{ t('user.hco.detail.edit') }}</span>
      </VTooltip>
    </template>
    <template #sections v-if="hco">
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.type") }}</dt>
        <dd class="view-item__value">{{ hco.type || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.region") }}</dt>
        <dd class="view-item__value">{{ hco.region || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.status") }}</dt>
        <dd class="view-item__value">{{ hco.status || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.phone") }}</dt>
        <dd class="view-item__value">
          <a v-if="hco.phone" :href="`tel:${hco.phone}`" class="view-item__link">{{ hco.phone }}</a>
          <span v-else class="view-item__empty">—</span>
        </dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.email") }}</dt>
        <dd class="view-item__value">
          <a v-if="hco.email" :href="`mailto:${hco.email}`" class="view-item__link">{{ hco.email }}</a>
          <span v-else class="view-item__empty">—</span>
        </dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.website") }}</dt>
        <dd class="view-item__value">
          <a v-if="hco.website" :href="hco.website" target="_blank" rel="noopener noreferrer" class="view-item__link">{{ hco.website }}</a>
          <span v-else class="view-item__empty">—</span>
        </dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.addressLine1") }}</dt>
        <dd class="view-item__value">{{ hco.address_line1 || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.city") }}</dt>
        <dd class="view-item__value">{{ hco.city || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.state") }}</dt>
        <dd class="view-item__value">{{ hco.state || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.postalCode") }}</dt>
        <dd class="view-item__value">{{ hco.postal_code || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("user.hco.detail.countryCode") }}</dt>
        <dd class="view-item__value">{{ hco.country_code || "—" }}</dd>
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

const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));
const OrganizationForm = defineAsyncComponent(() => import("../components/OrganizationForm.vue"));

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

interface HCO {
  id: string;
  name: string;
  type?: string;
  region?: string;
  status?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  website?: string;
}

const { t } = useI18n();
const route = useRoute();
const notifications = useNotifications();

const hco = ref<HCO | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string; hcoIds?: string[] } | undefined>(undefined);

function onScheduleVisit() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = `${date} 09:00`;
  const end = `${date} 10:00`;
  eventFormInitial.value = {
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    hcoIds: hco.value?.id ? [hco.value.id] : [],
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

async function onAccountSubmit(data: import("../components/OrganizationForm.vue").OrganizationSubmitPayload) {
  const id = hco.value?.id;
  if (!id) return;
  const body = JSON.stringify({
    name: data.name,
    type: data.type,
    status: data.status,
    region: data.region,
    address_line1: data.address_line1,
    city: data.city,
    state: data.state,
    postal_code: data.postal_code,
    country_code: data.country_code,
    phone: data.phone,
    email: data.email,
    website: data.website,
  });
  const res = await apiFetch(`/api/v1/organization/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "user.hco.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.hco.form.editSuccess"), "success");
    showEditModal.value = false;
    await loadHCO();
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}

async function loadHCO() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  hco.value = null;
  try {
    const res = await apiFetch(`/api/v1/organization/${id}`, { handleErrors: false });
    if (res.ok) {
      hco.value = (await res.json()) as HCO;
    } else if (res.status !== 404) {
      notifications.show(t("user.hco.errorLoad"), "error");
    }
  } catch {
    notifications.show(t("user.hco.errorLoad"), "error");
    hco.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadHCO);
watch(() => route.params.id, loadHCO);
</script>
