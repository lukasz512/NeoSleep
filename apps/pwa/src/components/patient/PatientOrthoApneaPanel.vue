<template>
  <div class="patient-orthoapnea-panel">
    <OrthoApneaOrderWizard
      v-if="latestSleepStudyId"
      v-model="showOrderWizard"
      :patient-id="props.patientId"
      :sleep-study-id="latestSleepStudyId"
      :draft-plan="resumeDraftPlan"
      @submitted="onWizardSubmitted"
    />

    <OrthoApneaTransactionLog
      v-if="transactionLogPlanId"
      v-model="showTransactionLog"
      :treatment-plan-id="transactionLogPlanId"
    />

    <!-- Admin-only "delete" — actually a soft hide (deleted_at, migration
         019), not a real DELETE: the local record and its partner_link/
         partner_transaction audit trail (migration 018) survive untouched,
         only the list view filters it out. Mainly for hiding failed/
         abandoned OrthoApnea orders. -->
    <VDialog v-model="showDeleteConfirm" max-width="380" persistent>
      <VCard>
        <VCardTitle>{{ t("app.treatmentPlans.deleteConfirmTitle") }}</VCardTitle>
        <VCardText>{{ t("app.treatmentPlans.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDeleteConfirm = false">{{ t("app.common.cancel") }}</AppButton>
          <AppButton color="error" :loading="deleting" @click="confirmDelete">{{ t("app.treatmentPlans.delete") }}</AppButton>
        </VCardActions>
      </VCard>
    </VDialog>

    <div class="patient-orthoapnea-panel__toolbar">
      <VTooltip :disabled="!!latestSleepStudyId" location="top">
        <template #activator="{ props: tooltipProps }">
          <span v-bind="tooltipProps">
            <AppButton color="primary" :disabled="!latestSleepStudyId" @click="startNewOrder">
              <template #prepend><AppIcon name="plus" /></template>
              {{ t("app.orthoApneaOrder.title") }}
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
      <li
        v-for="plan in plans"
        :key="plan.id"
        class="patient-orthoapnea-panel__item"
        :class="{ 'patient-orthoapnea-panel__item--static': !isDraft(plan) }"
      >
        <div class="patient-orthoapnea-panel__item-header" @click="isDraft(plan) && onEdit(plan)">
          <span class="patient-orthoapnea-panel__dentist">{{ plan.dentist_name || "—" }}</span>
          <VChip v-if="isDraft(plan)" color="warning" size="small" variant="tonal">{{ t("app.orthoApneaOrder.draftBadge") }}</VChip>
          <VChip v-else :color="statusColor(plan.status)" size="small" variant="tonal">{{ statusLabel(plan.status) }}</VChip>
          <VSpacer />
          <AppButton
            v-if="isAdmin"
            icon
            variant="text"
            size="small"
            :aria-label="t('app.orthoApneaOrder.transactionLog.openButton')"
            @click.stop="openTransactionLog(plan.id)"
          >
            <VIcon icon="mdi-information-outline" size="20" />
          </AppButton>
          <AppButton
            v-if="isAdmin"
            icon
            variant="text"
            size="small"
            color="error"
            :aria-label="t('app.treatmentPlans.delete')"
            @click.stop="requestDelete(plan.id)"
          >
            <AppIcon name="trash" />
          </AppButton>
        </div>
        <div class="patient-orthoapnea-panel__meta" @click="isDraft(plan) && onEdit(plan)">
          <span v-if="plan.scan_ordered_at">{{ t("app.treatmentPlans.table.scanOrdered") }}: {{ new Date(plan.scan_ordered_at).toLocaleDateString() }}</span>
          <span v-if="plan.appliance_delivered_at">{{ t("app.treatmentPlans.table.applianceDelivered") }}: {{ new Date(plan.appliance_delivered_at).toLocaleDateString() }}</span>
        </div>
        <a v-if="plan.scan_file_url" :href="plan.scan_file_url" target="_blank" rel="noopener" class="patient-orthoapnea-panel__scan-link" @click.stop>
          {{ t("app.treatmentPlans.form.scanFileUrl") }}
        </a>
        <AppButton variant="text" size="small" @click.stop="toggleComments(plan.id)">
          {{ expandedCommentsId === plan.id ? t("app.orthoApneaOrder.hideComments") : t("app.orthoApneaOrder.showComments") }}
        </AppButton>
        <OrthoApneaOrderComments v-if="expandedCommentsId === plan.id" :treatment-plan-id="plan.id" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import { apiFetch } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";
import { useAuthStore } from "../../stores/auth";
import OrthoApneaOrderWizard, { type OrthoApneaDraftPlan } from "./OrthoApneaOrderWizard.vue";
import OrthoApneaOrderComments from "./OrthoApneaOrderComments.vue";
import OrthoApneaTransactionLog from "./OrthoApneaTransactionLog.vue";

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
  metadata: Record<string, unknown> | null;
}

/** A draft is a treatment_plan we've saved locally with a wizard snapshot
 * but never actually sent to OrthoApnea — see OrthoApneaOrderWizard's own
 * persistDraft() for how it gets there, and onConfirm() for how the
 * `orthoapneaDraft` marker gets cleared once a real order goes out. */
function isDraft(plan: TreatmentPlanItem): boolean {
  return !!plan.metadata?.orthoapneaDraft;
}

interface SleepStudyRef {
  id: string;
  created_at: string;
}

const { t } = useI18n();
const notifications = useNotifications();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const plans = ref<TreatmentPlanItem[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);
const showOrderWizard = ref(false);
const showTransactionLog = ref(false);
const transactionLogPlanId = ref<string | null>(null);
const showDeleteConfirm = ref(false);
const deleting = ref(false);
const deleteTargetPlanId = ref<string | null>(null);
const expandedCommentsId = ref<string | null>(null);
const resumeDraftPlan = ref<OrthoApneaDraftPlan | null>(null);

function startNewOrder() {
  resumeDraftPlan.value = null;
  showOrderWizard.value = true;
}

function onWizardSubmitted() {
  resumeDraftPlan.value = null;
  loadPlans();
}

function toggleComments(planId: string) {
  expandedCommentsId.value = expandedCommentsId.value === planId ? null : planId;
}

/** Admin-only — opens OrthoApneaTransactionLog.vue for this order (see ADR-017). */
function openTransactionLog(planId: string) {
  transactionLogPlanId.value = planId;
  showTransactionLog.value = true;
}

/** Admin-only — soft-hides the order (deleted_at, migration 019); its
 * partner_link/partner_transaction history is untouched. */
function requestDelete(planId: string) {
  deleteTargetPlanId.value = planId;
  showDeleteConfirm.value = true;
}

async function confirmDelete() {
  const id = deleteTargetPlanId.value;
  if (!id) return;
  deleting.value = true;
  try {
    const res = await apiFetch(`/api/v1/treatment-plan/${id}`, { method: "DELETE", handleErrors: false });
    if (res.ok) {
      notifications.show(t("app.treatmentPlans.deleteSuccess"), "success");
      showDeleteConfirm.value = false;
      deleteTargetPlanId.value = null;
      await loadPlans();
    } else {
      notifications.show(t("app.treatmentPlans.deleteError"), "error");
    }
  } catch {
    notifications.show(t("app.treatmentPlans.deleteError"), "error");
  } finally {
    deleting.value = false;
  }
}
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

/** Only drafts are clickable — resumes the wizard where it was left off. A
 * submitted plan has no editing UI anymore (see the removed Add/Edit NOA
 * plan FormRenderer form — unused, dropped entirely). */
function onEdit(plan: TreatmentPlanItem) {
  resumeDraftPlan.value = { id: plan.id, metadata: plan.metadata };
  showOrderWizard.value = true;
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

/* Submitted plans have no click-to-edit anymore (the old Add/Edit NOA plan
   form was removed entirely — unused). Only drafts stay clickable. */
.patient-orthoapnea-panel__item--static {
  cursor: default;
}
.patient-orthoapnea-panel__item--static:hover {
  background: transparent;
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
