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
        <!-- The patient's answer from the appointment email (CORE-25); "can't come" gets the follow-up panel instead. -->
        <VChip
          v-if="responseState && !declined"
          :color="responseState === 'confirmed' ? 'success' : responseState === 'awaiting' ? 'info' : 'warning'"
          size="small"
          variant="tonal"
          class="appointment-detail__response"
          data-testid="appointment-patient-response"
        >
          <AppIcon :name="responseState === 'confirmed' ? 'check-circle' : responseState === 'awaiting' ? 'clock' : 'alert-triangle'" class="appointment-detail__response-icon" />
          {{ t(`user.appointments.patientResponse.${responseState}`) }}
        </VChip>
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

        <!-- NEO-254 (decision form D1, 2026-10-06): a guided follow-up — contact the patient, then record what you agreed (actions below). -->
        <section v-if="declined" class="appointment-detail__followup" data-testid="appointment-followup">
          <div class="appointment-detail__followup-head">
            <AppIcon name="alert-triangle" class="appointment-detail__followup-icon" />
            <div>
              <strong>{{ t('user.appointments.followup.title') }}</strong>
              <small v-if="answeredAgo">{{ t('user.appointments.followup.answered', { when: answeredAgo }) }}</small>
            </div>
          </div>
          <p v-if="appointment.patient_response_note" class="appointment-detail__suggestion" data-testid="appointment-patient-suggestion">
            {{ t('user.appointments.followup.suggestion', { note: appointment.patient_response_note }) }}
          </p>
          <template v-if="patientPhone">
            <span class="appointment-detail__step">{{ t('user.appointments.followup.stepContact') }}</span>
            <div class="appointment-detail__pills">
              <a :href="`tel:${patientPhone.replace(/[^0-9+]/g, '')}`" class="appointment-detail__pill" data-testid="appointment-call">
                <AppIcon name="phone" class="appointment-detail__pill-icon" />
                {{ patientPhone }}
              </a>
              <a
                :href="`https://wa.me/${patientPhone.replace(/\D/g, '')}`"
                target="_blank"
                rel="noopener noreferrer"
                class="appointment-detail__pill appointment-detail__pill--whatsapp"
                data-testid="appointment-whatsapp"
              >
                <AppIcon name="lead-source-whatsapp" class="appointment-detail__pill-icon" />
                {{ t('user.appointments.followup.whatsapp') }}
              </a>
            </div>
          </template>
        </section>

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
    <!-- NEO-254: after "I can't come", three equal outcomes; complete and no-show are hidden (the patient warned in advance). -->
    <template v-if="declined && changeable" #actions>
      <div class="appointment-detail__actions">
        <span v-if="patientPhone" class="appointment-detail__step">{{ t('user.appointments.followup.stepAgree') }}</span>
        <div class="appointment-detail__tiles">
          <AppButton variant="tonal" class="appointment-detail__tile" data-testid="appointment-reschedule" @click="emit('reschedule', appointment!)">
            <span class="appointment-detail__tile-inner">
              <AppIcon name="calendar-clock" class="appointment-detail__tile-icon" />
              {{ t('user.appointments.followup.newDate') }}
            </span>
          </AppButton>
          <AppButton variant="tonal" color="success" class="appointment-detail__tile" :loading="busy === 'keep'" data-testid="appointment-keep" @click="keep">
            <span class="appointment-detail__tile-inner">
              <AppIcon name="check-circle" class="appointment-detail__tile-icon" />
              {{ t('user.appointments.followup.keep') }}
            </span>
          </AppButton>
          <AppButton
            variant="tonal"
            color="error"
            class="appointment-detail__tile"
            :loading="busy === 'cancelled'"
            data-testid="appointment-cancel"
            @click="confirmCancel = true"
          >
            <span class="appointment-detail__tile-inner">
              <AppIcon name="x-circle" class="appointment-detail__tile-icon" />
              {{ t('user.appointments.followup.cancel') }}
            </span>
          </AppButton>
        </div>
      </div>
    </template>
    <template v-else-if="appointment?.status === 'scheduled' && !declined" #actions>
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
import { useAppointments, APPOINTMENT_STATUS_COLOR, appointmentResponseState, type Appointment, type AppointmentStatus } from "../composables/useAppointments";
import { formatTimeRange, formatDayLabel, timeZoneLabel } from "../utils/appointmentTime";
import { formatRelativeTime } from "../utils/relativeTime";
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

const busy = ref<AppointmentStatus | "keep" | null>(null);
const confirmCancel = ref(false);
const error = ref<string | null>(null);

const lang = computed(() => intlLocale(locale.value));
const timeRange = computed(() => (props.appointment ? formatTimeRange(props.appointment.start_at, props.appointment.end_at, props.appointment.timezone, lang.value) : ""));
const dayLabel = computed(() => (props.appointment ? formatDayLabel(props.appointment.start_at, props.appointment.timezone, lang.value) : ""));
const zoneLabel = computed(() => (props.appointment ? timeZoneLabel(props.appointment.start_at, props.appointment.timezone, lang.value) : ""));
const changeable = computed(() => !!props.appointment && canChange(props.appointment));
const responseState = computed(() => (props.appointment ? appointmentResponseState(props.appointment) : null));
/** NEO-254: the patient said "I can't come" — the dialog becomes a guided follow-up. */
const declined = computed(() => responseState.value === "cannot_attend");
const patientPhone = computed(() => props.appointment?.patient_phone?.trim() || null);
const answeredAgo = computed(() => (props.appointment?.patient_responded_at ? formatRelativeTime(props.appointment.patient_responded_at, locale.value) : ""));
/** "Book the next visit" after a completed one (Łukasz, 2026-09-26) — offered to whoever can book for this patient. */
const canBookNext = computed(() => !isFieldForce.value || changeable.value);

function close() {
  error.value = null;
  emit("update:modelValue", false);
}

async function save(key: AppointmentStatus | "keep", body: Record<string, unknown>, savedMessage: string) {
  if (!props.appointment) return;
  busy.value = key;
  error.value = null;
  try {
    const result = await update(props.appointment.id, body);
    if (!result.ok || !result.appointment) {
      error.value = t("user.appointments.form.errorSave");
      return;
    }
    notifications.show(savedMessage, "success", undefined, {
      icon: "nav-appointments",
      context: result.appointment.patient_name ?? undefined,
    });
    emit("changed", result.appointment);
  } catch (err) {
    reportCaught(err, { where: "AppointmentDetailDialog.save" });
    error.value = t("user.appointments.form.errorSave");
  } finally {
    busy.value = null;
  }
}

function setStatus(status: AppointmentStatus) {
  return save(status, { status }, t(`user.appointments.detail.saved.${status}`));
}

/** "Sí vendrá": the doctor reached the patient and they will come after all (NEO-254). */
function keep() {
  return save("keep", { patient_response: "confirmed" }, t("user.appointments.followup.kept"));
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

.appointment-detail__response {
  justify-self: start;
}

.appointment-detail__response-icon {
  margin-inline-end: 4px;
  font-size: 16px;
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

.appointment-detail__followup {
  display: grid;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 16px;
  background: rgba(var(--v-theme-warning), 0.12);
}

.appointment-detail__followup-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: rgb(var(--v-theme-warning));
}

.appointment-detail__followup-head strong {
  font-weight: 600;
}

.appointment-detail__followup-head small {
  display: block;
  margin-top: 2px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.appointment-detail__followup-icon {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
}

.appointment-detail__suggestion {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.appointment-detail__step {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.appointment-detail__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.appointment-detail__pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
}

.appointment-detail__pill--whatsapp {
  background: rgba(var(--v-theme-success), 0.16);
}

.appointment-detail__pill-icon {
  width: 16px;
  height: 16px;
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
