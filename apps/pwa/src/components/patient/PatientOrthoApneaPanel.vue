<template>
  <div class="patient-orthoapnea-panel">
    <FormRenderer
      v-model="showAddModal"
      :fields="treatmentPlanFormFields"
      title-key="app.treatmentPlans.form.title"
      submit-label-key="app.treatmentPlans.form.submit"
      @submit="onAddSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="treatmentPlanFormFields"
      :initial-data="selectedPlan ?? undefined"
      title-key="app.treatmentPlans.form.title"
      edit-title-key="app.treatmentPlans.form.editTitle"
      submit-label-key="app.treatmentPlans.form.submit"
      edit-submit-label-key="app.treatmentPlans.form.editSubmit"
      @submit="onEditSubmit"
    />

    <div class="patient-orthoapnea-panel__toolbar">
      <VTooltip :disabled="!!latestSleepStudyId" location="top">
        <template #activator="{ props: tooltipProps }">
          <span v-bind="tooltipProps">
            <AppButton color="primary" variant="tonal" :disabled="!latestSleepStudyId" @click="showAddModal = true">
              <template #prepend><AppIcon name="plus" /></template>
              {{ t("app.treatmentPlans.form.title") }}
            </AppButton>
          </span>
        </template>
        <span>{{ t("app.treatmentPlans.needsSleepStudy") }}</span>
      </VTooltip>
    </div>

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :title="t('app.errorState.title')"
      :subtitle="t('app.treatmentPlans.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadPlans"
    />
    <AppEmptyState v-else-if="plans.length === 0" :title="t('app.treatmentPlans.emptyTitle')" :subtitle="t('app.treatmentPlans.emptySubtitle')" />
    <ul v-else class="patient-orthoapnea-panel__list">
      <li v-for="plan in plans" :key="plan.id" class="patient-orthoapnea-panel__item" @click="onEdit(plan)">
        <div class="patient-orthoapnea-panel__item-header">
          <span class="patient-orthoapnea-panel__dentist">{{ plan.dentist_name || "—" }}</span>
          <VChip :color="statusColor(plan.status)" size="small" variant="tonal">{{ statusLabel(plan.status) }}</VChip>
        </div>
        <div class="patient-orthoapnea-panel__meta">
          <span v-if="plan.scan_ordered_at">{{ t("app.treatmentPlans.table.scanOrdered") }}: {{ new Date(plan.scan_ordered_at).toLocaleDateString() }}</span>
          <span v-if="plan.appliance_delivered_at">{{ t("app.treatmentPlans.table.applianceDelivered") }}: {{ new Date(plan.appliance_delivered_at).toLocaleDateString() }}</span>
        </div>
        <a v-if="plan.scan_file_url" :href="plan.scan_file_url" target="_blank" rel="noopener" class="patient-orthoapnea-panel__scan-link" @click.stop>
          {{ t("app.treatmentPlans.form.scanFileUrl") }}
        </a>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import { apiFetch } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";
import { treatmentPlanFormFields } from "../../config/forms/treatmentPlanForm";

const FormRenderer = defineAsyncComponent(() => import("../FormRenderer.vue"));

const props = defineProps<{ patientId: string }>();

interface TreatmentPlanItem {
  id: string;
  dentist_id: string | null;
  dentist_name: string | null;
  appointment_at: string | null;
  scan_ordered_at: string | null;
  scan_received_at: string | null;
  scan_file_url: string | null;
  appliance_ordered_at: string | null;
  appliance_delivered_at: string | null;
  notes: string | null;
  status: string;
}

interface SleepStudyRef {
  id: string;
  created_at: string;
}

const { t } = useI18n();
const notifications = useNotifications();

const plans = ref<TreatmentPlanItem[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);
const showAddModal = ref(false);
const showEditModal = ref(false);
const selectedPlan = ref<TreatmentPlanItem | null>(null);
/** The most recent sleep study for this patient — new OrthoApnea plans link to it (treatment_plan.sleep_study_id is required). */
const latestSleepStudyId = ref<string | null>(null);

async function loadPlans() {
  loading.value = true;
  loadError.value = false;
  try {
    const [plansRes, studiesRes] = await Promise.all([
      apiFetch(`/api/v1/treatment-plan?patient_id=${props.patientId}&type=dental_appliance&limit=-1`, { handleErrors: false }),
      apiFetch(`/api/v1/sleep-study?patient_id=${props.patientId}&limit=1&sortBy=created_at&sortOrder=desc`, { handleErrors: false }),
    ]);
    if (plansRes.ok) {
      const data = (await plansRes.json()) as { items: TreatmentPlanItem[] };
      plans.value = data.items;
    } else {
      loadError.value = true;
    }
    if (studiesRes.ok) {
      const data = (await studiesRes.json()) as { items: SleepStudyRef[] };
      latestSleepStudyId.value = data.items[0]?.id ?? null;
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "success";
    case "in_progress":
    case "patient_notified": return "info";
    case "cancelled": return "default";
    case "on_hold": return "warning";
    default: return "warning";
  }
}

function statusLabel(status: string): string {
  const key = `app.treatmentPlans.status.${status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
  return t(key);
}

async function onAddSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  if (!latestSleepStudyId.value) { done(false); return; }
  try {
    const res = await apiFetch("/api/v1/treatment-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        patient_id: props.patientId,
        sleep_study_id: latestSleepStudyId.value,
        type: "dental_appliance",
      }),
    });
    if (res.ok) {
      notifications.show(t("app.treatmentPlans.form.success"), "success");
      await loadPlans();
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onEdit(plan: TreatmentPlanItem) {
  selectedPlan.value = plan;
  showEditModal.value = true;
}

async function onEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedPlan.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/treatment-plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("app.treatmentPlans.form.editSuccess"), "success");
      await loadPlans();
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

onMounted(loadPlans);
watch(() => props.patientId, loadPlans);
</script>

<style scoped>
.patient-orthoapnea-panel__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}


.patient-orthoapnea-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.patient-orthoapnea-panel__item {
  padding: 12px 16px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}
.patient-orthoapnea-panel__item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.patient-orthoapnea-panel__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.patient-orthoapnea-panel__dentist {
  font-weight: 600;
  font-size: 0.9375rem;
}

.patient-orthoapnea-panel__meta {
  display: flex;
  gap: 16px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-bottom: 6px;
}

.patient-orthoapnea-panel__scan-link {
  font-size: 0.875rem;
  color: rgb(var(--v-theme-primary));
}
</style>
