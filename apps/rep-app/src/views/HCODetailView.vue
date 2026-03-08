<template>
  <div class="view-detail">
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <ItemDetailLayout
    :has-content="!!hco"
    :loading="loading"
    :back-route="{ name: 'hco' }"
    :back-label="t('rep.hco.detail.back')"
    :not-found-label="t('rep.hco.detail.notFound')"
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
      <VTooltip v-if="isAdmin" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="view-item__edit-btn view-item__edit-btn--no-border"
            disabled
            :aria-label="t('rep.hco.detail.editComingSoon')"
          >
            <svg class="view-item__edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </VBtn>
        </template>
        <span>{{ t('rep.hco.detail.editComingSoon') }}</span>
      </VTooltip>
    </template>
    <template #sections v-if="hco">
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("rep.hco.detail.type") }}</dt>
        <dd class="view-item__value">{{ hco.type || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("rep.hco.detail.region") }}</dt>
        <dd class="view-item__value">{{ hco.region || "—" }}</dd>
      </div>
      <div class="view-item__row">
        <dt class="view-item__label">{{ t("rep.hco.detail.status") }}</dt>
        <dd class="view-item__value">{{ hco.status || "—" }}</dd>
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
import EventForm from "../components/EventForm.vue";

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

interface HCO {
  id: string;
  name: string;
  type?: string;
  region?: string;
  status?: string;
}

const { t } = useI18n();
const route = useRoute();
const notifications = useNotifications();

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

async function loadHCO() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  hco.value = null;
  try {
    const res = await bffFetch(`/api/hco/${id}`, { errorMessageKey: "rep.hco.errorLoad" });
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
