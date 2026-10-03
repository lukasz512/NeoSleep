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
    <AppConfirmDialog
      v-model="showDeleteConfirm"
      :title="t('app.treatmentPlans.deleteConfirmTitle')"
      :text="t('app.treatmentPlans.deleteConfirmText')"
      :secondary-label="t('app.common.cancel')"
      :secondary-color="null"
      :primary-label="t('app.treatmentPlans.delete')"
      primary-color="error"
      :loading="deleting"
      @secondary="showDeleteConfirm = false"
      @primary="confirmDelete"
    />

    <!-- NEO-217: comments open beside the list (bottom sheet on a phone), so the rows never jump. -->
    <component
      :is="sheet ? VBottomSheet : VDialog"
      :model-value="commentsPlan !== null"
      :max-width="sheet ? undefined : 440"
      :content-class="sheet ? undefined : 'device-order-comments--side'"
      @update:model-value="(open: boolean) => !open && (commentsPlanId = null)"
    >
      <div v-if="commentsPlan" class="device-order-comments" data-testid="device-order-comments">
        <header class="device-order-comments__header">
          <h3 class="device-order-comments__title">{{ t("app.deviceOrder.comments.title", { n: commentsPlan.order_number ?? "" }) }}</h3>
          <AppButton icon variant="text" size="small" :aria-label="t('app.common.close')" @click="commentsPlanId = null">
            <AppIcon name="close" />
          </AppButton>
        </header>
        <OrthoApneaOrderComments :treatment-plan-id="commentsPlan.id" />
      </div>
    </component>

    <div class="patient-orthoapnea-panel__toolbar">
      <h3 class="patient-orthoapnea-panel__section">{{ t("app.deviceOrder.section") }}</h3>
      <VTooltip location="top">
        <template #activator="{ props: tooltipProps }">
          <span v-bind="tooltipProps">
            <AppButton
              class="patient-orthoapnea-panel__add"
              color="success"
              variant="tonal"
              :disabled="!latestSleepStudyId"
              :aria-label="t('app.orthoApneaOrder.title')"
              data-testid="device-order-new"
              @click="startNewOrder"
            >
              <AppIcon name="plus" />
            </AppButton>
          </span>
        </template>
        <span>{{ latestSleepStudyId ? t("app.orthoApneaOrder.title") : t("app.treatmentPlans.needsSleepStudy") }}</span>
      </VTooltip>
    </div>

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :error="loadFailure"
      :subtitle="t('app.treatmentPlans.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadPlans"
    />
    <AppEmptyState v-else-if="plans.length === 0" :title="t('app.treatmentPlans.emptyTitle')" :subtitle="t('app.treatmentPlans.emptySubtitle')" />
    <ul v-else class="patient-orthoapnea-panel__list">
      <AppStatusRow
        v-for="(row, index) in rows"
        :key="row.plan.id"
        :tone="DEVICE_ORDER_TONE[row.state]"
        :label="t(`app.deviceOrder.state.${row.state}`)"
        :data-state="row.state"
        data-testid="device-order-row"
      >
        <!-- D2: only the newest order shows dentist + track; an older one opens on click. -->
        <component
          :is="index === 0 ? 'div' : 'button'"
          v-bind="index === 0 ? {} : { type: 'button', 'aria-expanded': isOpen(row, index) }"
          class="patient-orthoapnea-panel__head"
          @click="index > 0 && toggleOpen(row.plan.id)"
        >
          <span class="patient-orthoapnea-panel__title">{{ rowTitle(row.plan) }}</span>
          <span class="patient-orthoapnea-panel__status" :class="{ 'patient-orthoapnea-panel__status--attention': row.state === 'attention' }">
            {{ statusLine(row) }}
          </span>
        </component>
        <template v-if="isOpen(row, index)">
          <EntityLink
            v-if="row.plan.dentist_id"
            class="patient-orthoapnea-panel__dentist"
            :to="hcpDetailLink(row.plan.dentist_id)"
            entity-type="hcp"
            :specialty="row.plan.dentist_specialty"
            :label="row.plan.dentist_name"
            :details="specialtySet(row.plan.dentist_specialty, row.plan.dentist_specialties).details"
            :more-details="specialtySet(row.plan.dentist_specialty, row.plan.dentist_specialties).more"
          />
          <a v-if="row.plan.scan_file_url" :href="row.plan.scan_file_url" target="_blank" rel="noopener" class="patient-orthoapnea-panel__scan-link">
            {{ t("app.treatmentPlans.form.scanFileUrl") }}
          </a>
          <ol class="patient-orthoapnea-panel__track" :aria-label="t('app.deviceOrder.track')" data-testid="device-order-track">
            <li
              v-for="step in trackSteps(row)"
              :key="step.key"
              class="patient-orthoapnea-panel__step"
              :class="`patient-orthoapnea-panel__step--${step.mark}`"
            >
              <span class="patient-orthoapnea-panel__dot" aria-hidden="true" />
              <strong>{{ t(`app.deviceOrder.step.${step.key}`) }}</strong>
              <span v-if="step.note">{{ step.note }}</span>
            </li>
          </ol>
        </template>

        <template #actions>
          <AppButton v-if="row.state === 'draft'" variant="text" size="small" color="primary" data-testid="device-order-continue" @click="onEdit(row.plan)">
            <template #prepend><AppIcon name="pencil" /></template>
            {{ t("app.deviceOrder.action.continue") }}
          </AppButton>
        </template>

        <!-- Comments: icon only, next to ⋯ (as everywhere else). D3: admin tools live
             under ⋯; hiding is offered on drafts only. -->
        <template v-if="isAdmin || row.plan.order_number" #menu>
          <AppButton
            v-if="row.plan.order_number"
            icon
            variant="text"
            class="patient-orthoapnea-panel__icon-btn"
            :aria-label="t('app.deviceOrder.action.comments')"
            :title="t('app.deviceOrder.action.comments')"
            data-testid="device-order-comments-open"
            @click="commentsPlanId = row.plan.id"
          >
            <AppIcon name="message" />
          </AppButton>
          <AppListItemMenu v-if="isAdmin" :aria-label="t('app.common.moreActions')">
            <VListItem :title="t('app.orthoApneaOrder.transactionLog.openButton')" @click="openTransactionLog(row.plan.id)">
              <template #prepend><AppIcon name="info-circle" /></template>
            </VListItem>
            <VListItem v-if="row.state === 'draft'" :title="t('app.deviceOrder.action.hideDraft')" base-color="error" @click="requestDelete(row.plan.id)">
              <template #prepend><AppIcon name="trash" /></template>
            </VListItem>
          </AppListItemMenu>
        </template>
      </AppStatusRow>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { intlLocale } from "@i18n/language-options";
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useDisplay } from "vuetify";
import { VBottomSheet } from "vuetify/components/VBottomSheet";
import { VDialog } from "vuetify/components/VDialog";
import AppButton from "../AppButton.vue";
import AppConfirmDialog from "../AppConfirmDialog.vue";
import AppIcon from "../AppIcon.vue";
import AppListItemMenu from "../AppListItemMenu.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import AppStatusRow from "../AppStatusRow.vue";
import EntityLink from "../EntityLink.vue";
import { useIdentity } from "../../composables/useIdentity";
import { hcpDetailLink } from "../../utils/entityLinks";
import { apiFetch } from "../../composables/useApi";
import { DEVICE_ORDER_TONE, deviceOrderState, type DeviceOrderState } from "../../utils/treatmentPlanStatus";
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
  dentist_specialty?: string | null;
  dentist_specialties?: string[] | null;
  appointment_at: string | null;
  scan_ordered_at: string | null;
  scan_received_at: string | null;
  scan_file_url: string | null;
  appliance_ordered_at: string | null;
  appliance_delivered_at: string | null;
  notes: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  /** NEO-217: the lab order behind the plan (partner_link) — null until it was ever sent. */
  order_number: string | null;
  order_sync_status: "pending" | "synced" | "failed" | null;
  order_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderRow {
  plan: TreatmentPlanItem;
  state: DeviceOrderState;
}

const { t, locale } = useI18n();
const { smAndDown: sheet } = useDisplay();
const route = useRoute();
const { specialtySet } = useIdentity();
const notifications = useNotifications();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const plans = ref<TreatmentPlanItem[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);
/** The error behind loadError (NEO-81) — lets the error state say offline vs. server problem. */
const loadFailure = ref<unknown>(null);
const showOrderWizard = ref(false);
const showTransactionLog = ref(false);
const transactionLogPlanId = ref<string | null>(null);
const showDeleteConfirm = ref(false);
const deleting = ref(false);
const deleteTargetPlanId = ref<string | null>(null);
const commentsPlanId = ref<string | null>(null);
const openIds = ref(new Set<string>());
const resumeDraftPlan = ref<OrthoApneaDraftPlan | null>(null);

/** Newest first (the API's created_at desc) — the first row is always open. */
const rows = computed<OrderRow[]>(() => plans.value.map((plan) => ({ plan, state: deviceOrderState(plan) })));
const commentsPlan = computed(() => plans.value.find((p) => p.id === commentsPlanId.value) ?? null);

function isOpen(row: OrderRow, index: number): boolean {
  return index === 0 || openIds.value.has(row.plan.id);
}

function toggleOpen(planId: string) {
  const next = new Set(openIds.value);
  if (!next.delete(planId)) next.add(planId);
  openIds.value = next;
}

// Two-digit day and month, the same as Documentos and the printed forms.
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(intlLocale(locale.value), { day: "2-digit", month: "2-digit", year: "numeric" });

// The track only needs day/month — the status line above carries the full date.
const formatShortDate = (value: string) => new Date(value).toLocaleDateString(intlLocale(locale.value), { day: "2-digit", month: "2-digit" });

function rowTitle(plan: TreatmentPlanItem): string {
  const title = t("app.deviceOrder.title");
  return plan.order_number ? t("app.deviceOrder.titleNumber", { title, n: plan.order_number }) : title;
}

/** The date each state's line talks about. */
function stateDate({ plan, state }: OrderRow): string {
  switch (state) {
    case "draft":
    case "cancelled":
      return plan.updated_at;
    case "attention":
    case "ordered":
      return plan.order_sent_at ?? plan.created_at;
    case "received":
      return plan.appliance_delivered_at ?? plan.updated_at;
  }
}

function statusLine(row: OrderRow): string {
  return t(`app.deviceOrder.line.${row.state}`, { date: formatDate(stateDate(row)) });
}

type StepMark = "on" | "now" | "failed" | "off";

/** Creado → Pedido → Recibido, each with its date once reached. */
function trackSteps(row: OrderRow): { key: "created" | "ordered" | "received"; mark: StepMark; note: string | null }[] {
  const { plan, state } = row;
  const sent = state === "ordered" || state === "received" || (state === "cancelled" && !!plan.order_sent_at);
  return [
    { key: "created", mark: state === "draft" ? "now" : "on", note: formatShortDate(plan.created_at) },
    {
      key: "ordered",
      mark: state === "attention" ? "failed" : state === "ordered" ? "now" : sent ? "on" : "off",
      note: state === "attention" ? t("app.deviceOrder.step.failed") : sent ? formatShortDate(plan.order_sent_at ?? plan.created_at) : null,
    },
    {
      key: "received",
      mark: state === "received" ? "on" : "off",
      note: state === "received" ? formatShortDate(stateDate(row)) : null,
    },
  ];
}

function startNewOrder() {
  resumeDraftPlan.value = null;
  showOrderWizard.value = true;
}

function onWizardSubmitted() {
  resumeDraftPlan.value = null;
  loadPlans();
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
      notifications.show(t("app.treatmentPlans.deleteSuccess"), "success", undefined, { icon: "nav-treatment-plans" });
      showDeleteConfirm.value = false;
      deleteTargetPlanId.value = null;
      await loadPlans();
    } else {
      notifications.show(t("app.treatmentPlans.deleteError"), "error", undefined, { icon: "nav-treatment-plans" });
    }
  } catch (err) {
    reportCaught(err, { where: "PatientOrthoApneaPanel.confirmDelete" });
    notifications.show(t("app.treatmentPlans.deleteError"), "error", undefined, { icon: "nav-treatment-plans" });
  } finally {
    deleting.value = false;
  }
}
/** The most recent sleep study for this patient — new OrthoApnea plans link to it (treatment_plan.sleep_study_id is required). */
const latestSleepStudyId = ref<string | null>(null);

async function loadPlans() {
  loading.value = true;
  loadError.value = false;
  loadFailure.value = null;
  try {
    const [plansRes, studiesRes] = await Promise.all([
      apiFetch(`/api/v1/treatment-plan?patient_id=${props.patientId}&type=dental_appliance&limit=-1`, { handleErrors: false }),
      // Id only — sleep-study contents are admin/doctor-only health data.
      apiFetch(`/api/v1/patient/${props.patientId}/sleep-study-ref`, { handleErrors: false }),
    ]);
    if (plansRes.ok) {
      const data = (await plansRes.json()) as { items: TreatmentPlanItem[] };
      plans.value = data.items;
      // ?comments=<plan id> (the admin Panel's comment list) opens that order's comments.
      const linked = route.query.comments;
      if (typeof linked === "string" && plans.value.some((p) => p.id === linked)) commentsPlanId.value = linked;
    } else {
      loadFailure.value = await reportFailedResponse(plansRes, { where: "PatientOrthoApneaPanel.loadPlans" });
      loadError.value = true;
    }
    if (studiesRes.ok) {
      const data = (await studiesRes.json()) as { id: string | null };
      latestSleepStudyId.value = data.id;
    }
  } catch (err) {
    reportCaught(err, { where: "PatientOrthoApneaPanel.loadPlans" });
    loadFailure.value = err;
    loadError.value = true;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
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
/* Section header like Documentos: label on the left, green ＋ on the right. */
.patient-orthoapnea-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.patient-orthoapnea-panel__section {
  flex: 1;
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.patient-orthoapnea-panel__add {
  min-width: var(--pwa-btn-min-height, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
  padding: 0;
}

.patient-orthoapnea-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.patient-orthoapnea-panel__head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
}
button.patient-orthoapnea-panel__head {
  cursor: pointer;
}
button.patient-orthoapnea-panel__head:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}
.patient-orthoapnea-panel__title {
  font-weight: 600;
  font-size: 0.9375rem;
}
.patient-orthoapnea-panel__status {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.patient-orthoapnea-panel__status--attention {
  color: rgb(var(--v-theme-error));
}
.patient-orthoapnea-panel__dentist {
  margin-top: 2px;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Creado → Pedido → Recibido: three equal columns, dot + line on top, the
   date under the label — never wraps mid-track, on a phone either. A step's
   line is coloured once the order has gone past it; the current step is ringed. */
.patient-orthoapnea-panel__track {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 420px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.patient-orthoapnea-panel__step {
  --step: rgba(var(--v-theme-on-surface), 0.25);
  --line: rgba(var(--v-theme-on-surface), 0.15);
  position: relative;
  display: flex;
  flex-direction: column;
  padding-top: 14px;
  min-width: 0;
}
.patient-orthoapnea-panel__step::before {
  content: "";
  position: absolute;
  top: 3px;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--line);
}
.patient-orthoapnea-panel__step:last-child::before {
  display: none;
}
.patient-orthoapnea-panel__step--on {
  --line: rgb(var(--v-theme-primary));
}
.patient-orthoapnea-panel__step strong {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}
.patient-orthoapnea-panel__step--off strong {
  font-weight: 400;
  color: inherit;
}
.patient-orthoapnea-panel__step--on,
.patient-orthoapnea-panel__step--now {
  --step: rgb(var(--v-theme-primary));
}
.patient-orthoapnea-panel__step--failed {
  --step: rgb(var(--v-theme-error));
}
.patient-orthoapnea-panel__step--failed strong {
  color: rgb(var(--v-theme-error));
}
.patient-orthoapnea-panel__dot {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 2px solid var(--step);
}
.patient-orthoapnea-panel__step--on .patient-orthoapnea-panel__dot,
.patient-orthoapnea-panel__step--failed .patient-orthoapnea-panel__dot {
  background: var(--step);
}
.patient-orthoapnea-panel__step--now .patient-orthoapnea-panel__dot {
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.2);
}

/* Same footprint and tone as the ⋯ trigger beside it. */
.patient-orthoapnea-panel__icon-btn {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-orthoapnea-panel__scan-link {
  margin-top: 4px;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
}

.device-order-comments {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
  background: rgb(var(--v-theme-surface));
}
.device-order-comments__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.device-order-comments__title {
  flex: 1;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
</style>

<style>
/* D4: on desktop the comments dialog docks to the right edge as a side panel. */
.device-order-comments--side {
  position: fixed !important;
  inset: 0 0 0 auto !important;
  margin: 0 !important;
  width: min(440px, 100vw) !important;
  max-height: 100% !important;
  height: 100%;
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
