<template>
  <VDialog
    :model-value="modelValue && !!appointment"
    max-width="480"
    content-class="pwa-form-dialog__content"
    class="appointment-detail"
    :transition="originDialogTransition"
    @update:model-value="close"
  >
    <VCard v-if="appointment" class="pwa-form-dialog__card">
      <AppDialogHeader
        :title="t('user.appointments.detail.title')"
        avatar-entity-type="patient"
        :avatar-name="appointment.patient_name ?? ''"
        @close="close"
      />
      <VCardText class="appointment-detail__body">
        <div class="appointment-detail__when">
          <span class="appointment-detail__time">{{ timeRange }}</span>
          <span class="appointment-detail__day">{{ dayLabel }} · {{ zoneLabel }}</span>
          <VChip :color="APPOINTMENT_STATUS_COLOR[appointment.status]" size="small" variant="tonal" class="appointment-detail__status" data-testid="appointment-status">
            {{ t(`user.appointments.status.${appointment.status}`) }}
          </VChip>
        </div>
        <dl class="appointment-detail__facts">
          <dt>{{ t('user.appointments.form.fieldPatient') }}</dt>
          <dd>
            <RouterLink :to="{ name: 'patient-detail', params: { id: appointment.patient_id } }" @click="close">
              {{ appointment.patient_name }}
            </RouterLink>
          </dd>
          <dt>{{ t('user.appointments.form.fieldDoctor') }}</dt>
          <dd>{{ appointment.practitioner_name }}</dd>
          <template v-if="appointment.organization_name">
            <dt>{{ t('user.appointments.detail.clinic') }}</dt>
            <dd>{{ appointment.organization_name }}</dd>
          </template>
          <template v-if="appointment.notes">
            <dt>{{ t('user.appointments.form.fieldNotes') }}</dt>
            <dd class="appointment-detail__notes">{{ appointment.notes }}</dd>
          </template>
        </dl>

        <VAlert v-if="appointment.status === 'completed' && canBookNext" type="info" variant="tonal" density="compact" class="mt-4">
          <div class="appointment-detail__next">
            <span>{{ t('user.appointments.detail.bookNextPrompt') }}</span>
            <AppButton size="small" color="primary" variant="flat" data-testid="appointment-book-next" @click="emit('bookNext', appointment)">
              {{ t('user.appointments.detail.bookNext') }}
            </AppButton>
          </div>
        </VAlert>
        <VAlert v-if="error" type="warning" variant="tonal" density="compact" class="mt-4">{{ error }}</VAlert>
      </VCardText>

      <VCardActions v-if="appointment.status === 'scheduled'" class="appointment-detail__actions">
        <AppButton v-if="changeable" variant="text" color="error" :loading="busy === 'cancelled'" data-testid="appointment-cancel" @click="confirmCancel = true">
          {{ t('user.appointments.detail.cancel') }}
        </AppButton>
        <VSpacer />
        <AppButton v-if="canClose" variant="text" :loading="busy === 'no_show'" data-testid="appointment-no-show" @click="setStatus('no_show')">
          {{ t('user.appointments.detail.noShow') }}
        </AppButton>
        <AppButton v-if="changeable" variant="text" data-testid="appointment-reschedule" @click="emit('reschedule', appointment)">
          {{ t('user.appointments.detail.reschedule') }}
        </AppButton>
        <AppButton v-if="canClose" color="primary" variant="flat" :loading="busy === 'completed'" data-testid="appointment-complete" @click="setStatus('completed')">
          {{ t('user.appointments.detail.complete') }}
        </AppButton>
      </VCardActions>
    </VCard>

    <VDialog v-model="confirmCancel" max-width="360" content-class="pwa-form-dialog__content" :transition="originDialogTransition" persistent>
      <VCard class="pwa-confirm-dialog__card">
        <VCardText>{{ t('user.appointments.detail.cancelConfirm') }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="confirmCancel = false">{{ t('app.common.no') }}</AppButton>
          <AppButton color="error" variant="text" data-testid="appointment-cancel-confirm" @click="onConfirmCancel">
            {{ t('user.appointments.detail.cancel') }}
          </AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { reportCaught } from "@api";
import { originDialogTransition } from "@ui";
import { intlLocale } from "@i18n/language-options";
import { useNotifications } from "../composables/useNotifications";
import { useAppointments, APPOINTMENT_STATUS_COLOR, type Appointment, type AppointmentStatus } from "../composables/useAppointments";
import { formatTimeRange, formatDayLabel, timeZoneLabel } from "../utils/appointmentTime";
import AppButton from "./AppButton.vue";
import AppDialogHeader from "./AppDialogHeader.vue";

const props = defineProps<{ modelValue: boolean; appointment: Appointment | null }>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  changed: [appointment: Appointment];
  reschedule: [appointment: Appointment];
  bookNext: [appointment: Appointment];
}>();

const { t, locale } = useI18n();
const notifications = useNotifications();
const { canClose, canChange, isFieldForce, update } = useAppointments();

const busy = ref<AppointmentStatus | null>(null);
const confirmCancel = ref(false);
const error = ref<string | null>(null);

const lang = computed(() => intlLocale(locale.value));
const timeRange = computed(() => (props.appointment ? formatTimeRange(props.appointment.start_at, props.appointment.end_at, props.appointment.timezone, lang.value) : ""));
const dayLabel = computed(() => (props.appointment ? formatDayLabel(props.appointment.start_at, props.appointment.timezone, lang.value) : ""));
const zoneLabel = computed(() => (props.appointment ? timeZoneLabel(props.appointment.start_at, props.appointment.timezone, lang.value) : ""));
const changeable = computed(() => !!props.appointment && canChange(props.appointment));
/** "Book the next visit" after a completed one (Łukasz, 2026-09-26) — offered to whoever can book for this patient. */
const canBookNext = computed(() => !isFieldForce.value || changeable.value);

function close() {
  error.value = null;
  emit("update:modelValue", false);
}

async function setStatus(status: AppointmentStatus) {
  if (!props.appointment) return;
  busy.value = status;
  error.value = null;
  try {
    const result = await update(props.appointment.id, { status });
    if (!result.ok || !result.appointment) {
      error.value = t("user.appointments.form.errorSave");
      return;
    }
    notifications.show(t(`user.appointments.detail.saved.${status}`), "success", undefined, {
      icon: "nav-appointments",
      context: result.appointment.patient_name ?? undefined,
    });
    emit("changed", result.appointment);
  } catch (err) {
    reportCaught(err, { where: "AppointmentDetailDialog.setStatus" });
    error.value = t("user.appointments.form.errorSave");
  } finally {
    busy.value = null;
  }
}

async function onConfirmCancel() {
  confirmCancel.value = false;
  await setStatus("cancelled");
}
</script>

<style scoped>
.appointment-detail__body {
  display: grid;
  gap: 16px;
}

.appointment-detail__when {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  row-gap: 2px;
}

.appointment-detail__time {
  font-size: 1.375rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.appointment-detail__day {
  grid-column: 1;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.appointment-detail__status {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.appointment-detail__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  margin: 0;
}

.appointment-detail__facts dt {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.appointment-detail__facts dd {
  margin: 0;
}

.appointment-detail__notes {
  white-space: pre-wrap;
}

.appointment-detail__next {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.appointment-detail__actions {
  flex-wrap: wrap;
}
</style>
