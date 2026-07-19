<template>
  <div class="view-detail">
    <FormRenderer
      v-model="showEditModal"
      :fields="patientFormFields"
      :initial-data="patient ?? undefined"
      title-key="app.patients.form.title"
      edit-title-key="app.patients.form.editTitle"
      submit-label-key="app.patients.form.submit"
      edit-submit-label-key="app.patients.form.editSubmit"
      avatar-entity-type="patient"
      @submit="onPatientSubmit"
    />
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <ItemDetailLayout
      :has-content="!!patient"
      :loading="loading"
      :back-route="{ name: 'patients' }"
      :back-label="t('app.patients.detail.back')"
      :not-found-label="t('app.patients.detail.notFound')"
    >
      <template #title v-if="patient">
        <span class="view-item__title-wrap">
          <AppAvatar :name="patient.name" entity-type="patient" :size="40" />
          <h1 class="view-item__title">{{ patient.name }}</h1>
        </span>
      </template>
      <template #header-actions v-if="patient">
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
              :aria-label="t('app.patients.detail.edit')"
              @click="onEdit"
            >
              <AppIcon :name="entityActionIcon('edit')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('app.patients.detail.edit') }}</span>
        </VTooltip>
      </template>
      <template #sections v-if="patient">
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.email") }}</dt>
          <dd class="view-item__value">
            <a v-if="patient.email" :href="`mailto:${patient.email}`" class="view-item__link">{{ patient.email }}</a>
            <span v-else class="view-item__empty">—</span>
          </dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.phone") }}</dt>
          <dd class="view-item__value">
            <a v-if="patient.phone" :href="`tel:${patient.phone}`" class="view-item__link">{{ patient.phone }}</a>
            <span v-else class="view-item__empty">—</span>
          </dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.practitioner") }}</dt>
          <dd class="view-item__value">{{ patient.practitioner_name || "—" }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.status") }}</dt>
          <dd class="view-item__value">{{ statusLabel(patient.status) }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.region") }}</dt>
          <dd class="view-item__value">{{ patient.region || "—" }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.ahiBaseline") }}</dt>
          <dd class="view-item__value">{{ patient.ahi_baseline ?? "—" }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.cpapDevice") }}</dt>
          <dd class="view-item__value">{{ patient.cpap_device || "—" }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("app.patients.detail.medicalRecord") }}</dt>
          <dd class="view-item__value">{{ patient.medical_record || "—" }}</dd>
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
import AppIcon from "../components/AppIcon.vue";
import AppAvatar from "../components/AppAvatar.vue";
import { patientFormFields } from "../config/forms/patientForm";
import { entityActionIcon, entityActionBtnClass } from "../config/entityActions";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

interface PatientDetail {
  id: string;
  name: string;
  salutation?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  practitioner_id?: string | null;
  practitioner_name?: string | null;
  status?: string;
  region?: string;
  ahi_baseline?: number | null;
  cpap_device?: string | null;
  medical_record?: string | null;
}

const { t } = useI18n();
const route = useRoute();
const notifications = useNotifications();

const patient = ref<PatientDetail | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string; patientIds?: string[] } | undefined>(undefined);

function statusLabel(status?: string): string {
  switch (status) {
    case "active":     return t("app.patients.filters.statusActive");
    case "follow_up":  return t("app.patients.filters.statusFollowUp");
    case "discharged": return t("app.patients.filters.statusDischarged");
    default:           return status || "—";
  }
}

function onEdit() {
  showEditModal.value = true;
}

function onScheduleVisit() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  eventFormInitial.value = {
    start_at: new Date(`${date} 09:00`).toISOString(),
    end_at: new Date(`${date} 10:00`).toISOString(),
    patientIds: patient.value?.id ? [patient.value.id] : [],
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

async function onPatientSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = patient.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/patient/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("app.patients.form.editSuccess"), "success");
      await loadPatient();
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

async function loadPatient() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  patient.value = null;
  try {
    const res = await apiFetch(`/api/v1/patient/${id}`, { handleErrors: false });
    if (res.ok) {
      patient.value = (await res.json()) as PatientDetail;
    } else if (res.status !== 404) {
      notifications.show(t("app.patients.errorLoad"), "error");
    }
  } catch {
    notifications.show(t("app.patients.errorLoad"), "error");
    patient.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadPatient);
watch(() => route.params.id, loadPatient);
</script>

<style scoped>
.view-item__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
