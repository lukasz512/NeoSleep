<template>
  <div class="view-detail">
    <EventForm
      v-if="showEventForm"
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
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
            disabled
            :aria-label="t('user.hco.detail.editComingSoon')"
          >
            <AppIcon name="pencil" class="view-item__edit-icon" />
          </VBtn>
        </template>
        <span>{{ t('user.hco.detail.editComingSoon') }}</span>
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
          <span v-else class="view-item__empty">{{ demoPhone }}</span>
        </dd>
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

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

interface HCO {
  id: string;
  name: string;
  type?: string;
  region?: string;
  status?: string;
  phone?: string;
}

const { t } = useI18n();
const route = useRoute();
const notifications = useNotifications();

const DEMO_PHONES: Record<string, string> = {
  "Clínica del Sueño NeoSleep":           "+52 81 2345 6789",
  "Hospital General de Monterrey":        "+52 81 8765 4321",
  "Centro Pulmonar del Sur":              "+52 55 3456 7890",
  "Clínica Salud Integral Occidente":     "+52 33 4567 8901",
  "Unidad de ORL y Trastornos del Sueño": "+52 81 5678 9012",
};

const demoPhone = computed(() =>
  hco.value ? (DEMO_PHONES[hco.value.name] ?? "+52 55 0000 0000") : "—"
);

const hco = ref<HCO | null>(null);
const loading = ref(true);
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

async function loadHCO() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  hco.value = null;
  try {
    const res = await apiFetch(`/api/v1/organization/${id}`, { errorMessageKey: "user.hco.errorLoad" });
    if (res.ok) {
      hco.value = (await res.json()) as HCO;
    }
  } catch {
    hco.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadHCO);
watch(() => route.params.id, loadHCO);
</script>
