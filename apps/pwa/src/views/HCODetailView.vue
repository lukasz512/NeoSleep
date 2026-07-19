<template>
  <div class="view-detail">
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="hcoFormFields"
      :initial-data="hco ?? undefined"
      title-key="user.hco.form.title"
      edit-title-key="user.hco.form.editTitle"
      submit-label-key="user.hco.form.submit"
      edit-submit-label-key="user.hco.form.editSubmit"
      avatar-entity-type="hco"
      @submit="onAccountSubmit"
    />
    <ItemDetailLayout
    :has-content="!!hco"
    :loading="loading"
    :back-route="{ name: 'hco' }"
    :back-label="t('user.hco.detail.back')"
    :not-found-label="t('user.hco.detail.notFound')"
  >
    <template #title v-if="hco">
      <span class="view-item__title-wrap">
        <AppAvatar :name="hco.name" entity-type="hco" :size="40" />
        <h1 class="view-item__title">{{ hco.name }}</h1>
      </span>
    </template>
    <template #header-actions v-if="hco">
      <VTooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            :class="entityActionBtnClass('scheduleVisit')"
            :aria-label="t('user.detail.scheduleVisit')"
            @click="onScheduleVisit"
          >
            <AppIcon :name="entityActionIcon('scheduleVisit')" class="view-item__action-icon" />
          </AppButton>
        </template>
        <span>{{ t('user.detail.scheduleVisit') }}</span>
      </VTooltip>
      <VTooltip v-if="isAdmin" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            :class="entityActionBtnClass('edit')"
            :aria-label="t('user.hco.detail.edit')"
            @click="onEdit"
          >
            <AppIcon :name="entityActionIcon('edit')" class="view-item__action-icon" />
          </AppButton>
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
import AppButton from "../components/AppButton.vue";
import AppAvatar from "../components/AppAvatar.vue";
import AppIcon from "../components/AppIcon.vue";
import { hcoFormFields } from "../config/forms/hcoForm";
import { entityActionIcon, entityActionBtnClass } from "../config/entityActions";

const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));
const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

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
  google_link?: string;
  specialties?: string[];
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

async function onEventFormSubmit(
  payload: import("../components/EventForm.vue").EventSubmitPayload,
  done: (ok: boolean) => void,
) {
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

function onEdit() {
  showEditModal.value = true;
}

async function onAccountSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = hco.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/organization/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.hco.form.editSuccess"), "success");
      await loadHCO();
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
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

<style scoped>
.view-item__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
