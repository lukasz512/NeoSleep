<template>
  <div class="view-detail">
    <PatientForm
      v-if="showEditModal"
      v-model="showEditModal"
      :initial-data="patient ? {
        id: patient.id,
        salutation: patient.salutation ?? '',
        first_name: patient.first_name ?? '',
        last_name: patient.last_name ?? '',
        email: patient.email ?? '',
        phone: patient.phone ?? '',
        practitioner_id: patient.practitioner_id ?? '',
        status: patient.status ?? '',
        region: patient.region ?? '',
        ahi_baseline: patient.ahi_baseline ?? null,
        cpap_device: patient.cpap_device ?? '',
        medical_record: patient.medical_record ?? '',
      } : undefined"
      @submit="onPatientSubmit"
    />
    <ItemDetailLayout
      :has-content="!!patient"
      :loading="loading"
      :back-route="{ name: 'patients' }"
      :back-label="t('app.patients.detail.back')"
      :not-found-label="t('app.patients.detail.notFound')"
      :title="patient?.name"
    >
      <template #header-actions v-if="patient">
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              class="view-item__edit-btn view-item__edit-btn--no-border"
              :aria-label="t('app.patients.detail.edit')"
              @click="onEdit"
            >
              <AppIcon name="pencil" class="view-item__edit-icon" />
            </VBtn>
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
import AppIcon from "../components/AppIcon.vue";

const PatientForm = defineAsyncComponent(() => import("../components/PatientForm.vue"));

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

async function onPatientSubmit(data: import("../components/PatientForm.vue").PatientSubmitPayload) {
  const id = patient.value?.id;
  if (!id) return;
  const body = JSON.stringify({
    salutation:      data.salutation,
    first_name:      data.first_name,
    last_name:       data.last_name,
    email:           data.email,
    phone:           data.phone,
    practitioner_id: data.practitioner_id,
    status:          data.status,
    region:          data.region,
    ahi_baseline:    data.ahi_baseline,
    cpap_device:     data.cpap_device,
    medical_record:  data.medical_record,
  });
  const res = await apiFetch(`/api/v1/patient/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    errorMessageKey: "app.patients.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("app.patients.form.editSuccess"), "success");
    showEditModal.value = false;
    await loadPatient();
    window.dispatchEvent(new Event("entity-list-refresh"));
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
