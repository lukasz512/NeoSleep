<template>
  <AppFormDialog
    :model-value="modelValue && !!appointment"
    :max-width="480"
    :title="t('user.appointments.detail.title')"
    avatar-entity-type="patient"
    :avatar-name="appointment?.patient_name ?? ''"
    @update:model-value="close"
    @close="close"
  >
    <div v-if="appointment" class="appointment-detail__body">
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

        <AppInlineAlert v-if="appointment.status === 'completed' && canBookNext" type="info" class="mt-4">
          <div class="appointment-detail__next">
            <span>{{ t('user.appointments.detail.bookNextPrompt') }}</span>
            <AppButton size="small" color="primary" variant="flat" data-testid="appointment-book-next" @click="emit('bookNext', appointment)">
              {{ t('user.appointments.detail.bookNext') }}
            </AppButton>
          </div>
        </AppInlineAlert>
        <AppInlineAlert v-if="error" type="warning" class="mt-4">{{ error }}</AppInlineAlert>
    </div>

    <!-- One layout for phone and desktop: the main outcome as a full-width button, the other three as
         equal icon tiles under it (Łukasz, 2026-09-26: the text-only row was unreadable). -->
    <template v-if="appointment?.status === 'scheduled'" #actions>
      <div class="appointment-detail__actions">
        <AppButton
          v-if="canClose"
          block
          size="large"
          color="primary"
          variant="flat"
          class="appointment-detail__primary"
          :loading="busy === 'completed'"
          data-testid="appointment-complete"
          @click="setStatus('completed')"
        >
          <AppIcon name="check-circle" class="appointment-detail__primary-icon" />
          {{ t('user.appointments.detail.complete') }}
        </AppButton>
        <div class="appointment-detail__tiles">
          <AppButton
            v-if="changeable"
            variant="tonal"
            class="appointment-detail__tile"
            data-testid="appointment-reschedule"
            @click="emit('reschedule', appointment!)"
          >
            <span class="appointment-detail__tile-inner">
              <AppIcon name="calendar-clock" class="appointment-detail__tile-icon" />
              {{ t('user.appointments.detail.reschedule') }}
            </span>
          </AppButton>
          <AppButton
            v-if="canClose"
            variant="tonal"
            color="warning"
            class="appointment-detail__tile"
            :loading="busy === 'no_show'"
            data-testid="appointment-no-show"
            @click="setStatus('no_show')"
          >
            <span class="appointment-detail__tile-inner">
              <AppIcon name="user-x" class="appointment-detail__tile-icon" />
              {{ t('user.appointments.detail.noShow') }}
            </span>
          </AppButton>
          <AppButton
            v-if="changeable"
            variant="tonal"
            color="error"
            class="appointment-detail__tile"
            :loading="busy === 'cancelled'"
            data-testid="appointment-cancel"
            @click="confirmCancel = true"
          >
            <span class="appointment-detail__tile-inner">
              <AppIcon name="x-circle" class="appointment-detail__tile-icon" />
              {{ t('user.appointments.detail.cancelShort') }}
            </span>
          </AppButton>
        </div>
      </div>
    </template>

    <template #overlays>
      <AppConfirmDialog
        v-model="confirmCancel"
        :text="t('user.appointments.detail.cancelConfirm')"
        :secondary-label="t('app.common.no')"
        :secondary-color="null"
        :primary-label="t('user.appointments.detail.cancel')"
        primary-color="error"
        @secondary="confirmCancel = false"
        @primary="onConfirmCancel"
      />
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { reportCaught } from "@api";
import { intlLocale } from "@i18n/language-options";
import { useNotifications } from "../composables/useNotifications";
import { useAppointments, APPOINTMENT_STATUS_COLOR, type Appointment, type AppointmentStatus } from "../composables/useAppointments";
import { formatTimeRange, formatDayLabel, timeZoneLabel } from "../utils/appointmentTime";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import AppFormDialog from "./AppFormDialog.vue";
import AppConfirmDialog from "./AppConfirmDialog.vue";
import { AppInlineAlert } from "@ui";

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
  display: grid;
  gap: 8px;
  width: 100%;
}

.appointment-detail__primary {
  text-transform: none;
  letter-spacing: 0;
}

.appointment-detail__primary-icon {
  margin-right: 8px;
}

.appointment-detail__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  grid-auto-flow: column;
  gap: 8px;
}

.appointment-detail__tile {
  height: 72px !important;
  min-width: 0;
  border-radius: 14px !important;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.8125rem;
}

.appointment-detail__tile-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  white-space: normal;
  line-height: 1.2;
}

.appointment-detail__tile-icon {
  width: 22px;
  height: 22px;
}
</style>
