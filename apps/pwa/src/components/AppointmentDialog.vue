<template>
  <AppFormDialog
    :model-value="modelValue"
    :max-width="560"
    :title="isEdit ? t('user.appointments.form.editTitle') : t('user.appointments.form.title')"
    avatar-entity-type="patient"
    :avatar-name="patientName"
    @update:model-value="close"
    @close="close"
  >
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <AppInlineAlert v-if="problem" type="warning" class="mb-4" data-testid="appointment-problem">
            {{ problem }}
          </AppInlineAlert>

          <p v-if="isEdit || fixedPatient" class="appointment-dialog__fixed mb-3">
            <span class="appointment-dialog__label">{{ t('user.appointments.form.fieldPatient') }}</span>
            <span>{{ patientName }}</span>
          </p>
          <VAutocomplete
            v-else
            v-model="patientId"
            :label="t('user.appointments.form.fieldPatient')"
            :items="patientOptions"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :loading="loadingPatients"
            :rules="[required]"
            data-testid="appointment-patient"
          >
            <template #item="{ internalItem: item, props: itemProps }">
              <VListItem v-if="item.value" v-bind="itemProps" :title="item.raw.name">
                <template #prepend>
                  <AppAvatar :name="item.raw.name" entity-type="patient" :size="28" />
                </template>
              </VListItem>
            </template>
          </VAutocomplete>

          <p v-if="isEdit || fixedPractitioner || isDoctor" class="appointment-dialog__fixed mb-3">
            <span class="appointment-dialog__label">{{ t('user.appointments.form.fieldDoctor') }}</span>
            <span>{{ practitionerName || t('user.appointments.form.doctorSelf') }}</span>
          </p>
          <VAutocomplete
            v-else
            v-model="practitionerId"
            :label="t('user.appointments.form.fieldDoctor')"
            :hint="practitionerId && practitionerId === patientDefaultPractitionerId ? t('user.appointments.form.assignedDoctorHint') : undefined"
            persistent-hint
            :items="practitionerOptions"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :loading="loadingPractitioners"
            :rules="[required]"
            data-testid="appointment-doctor"
          >
            <template #prepend-inner>
              <AppIcon name="nav-hcp" class="pwa-form-field-icon" />
            </template>
          </VAutocomplete>

          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="startWall"
              :label="t('user.appointments.form.fieldStart')"
              type="datetime-local"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              :rules="[required]"
              data-testid="appointment-start"
            />
            <VSelect
              v-model="duration"
              :label="t('user.appointments.form.fieldDuration')"
              :items="durationItems"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
          </div>

          <VTextarea
            v-if="!isFieldForce"
            v-model="notes"
            :label="t('user.appointments.form.fieldNotes')"
            variant="outlined"
            density="comfortable"
            rows="2"
            auto-grow
            class="mb-1"
          />
          <p class="appointment-dialog__tz">{{ t('user.appointments.form.timeZoneHint', { zone: zoneLabel }) }}</p>
        </VForm>
    <template #actions>
      <VSpacer />
      <AppButton variant="text" @click="close">{{ t('app.common.cancel') }}</AppButton>
      <AppButton color="primary" :loading="submitting" data-testid="appointment-submit" @click="onSubmit">
        {{ isEdit ? t('user.appointments.form.editSubmit') : t('user.appointments.form.submit') }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { reportCaught } from "@api";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import {
  useAppointments,
  APPOINTMENT_DURATIONS,
  DEFAULT_APPOINTMENT_DURATION,
  type Appointment,
  type AppointmentWriteResult,
} from "../composables/useAppointments";
import { deviceTimeZone, toZonedInputValue, zonedInputToIso, timeZoneLabel } from "../utils/appointmentTime";
import { intlLocale } from "@i18n/language-options";
import AppButton from "./AppButton.vue";
import AppAvatar from "./AppAvatar.vue";
import AppIcon from "./AppIcon.vue";
import AppFormDialog from "./AppFormDialog.vue";
import { AppInlineAlert } from "@ui";

interface NamedRef {
  id: string;
  name: string;
  practitioner_id?: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  /** Reschedule this appointment (patient + doctor stay fixed). */
  appointment?: Appointment | null;
  /** Book for this patient (patient card, patients list, "book next"). */
  patient?: NamedRef | null;
  /** Book with this doctor (HCP card, "book next"). */
  practitioner?: { id: string; name: string } | null;
  /** Pre-filled start (agenda slot click, "book next"). */
  startAt?: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [appointment: Appointment];
}>();

const { t, locale } = useI18n();
const notifications = useNotifications();
const { isFieldForce, isDoctor, create, update } = useAppointments();

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const patientId = ref<string | null>(null);
const practitionerId = ref<string | null>(null);
const startWall = ref("");
const duration = ref<number>(DEFAULT_APPOINTMENT_DURATION);
const notes = ref("");
const submitting = ref(false);
const problem = ref<string | null>(null);

const patientOptions = ref<NamedRef[]>([]);
const practitionerOptions = ref<NamedRef[]>([]);
const loadingPatients = ref(false);
const loadingPractitioners = ref(false);

const isEdit = computed(() => !!props.appointment);
const fixedPatient = computed(() => props.patient ?? null);
const fixedPractitioner = computed(() => props.practitioner ?? null);
/** An existing appointment keeps its clinic zone; a new one is entered in the device's zone (same market). */
const zone = computed(() => props.appointment?.timezone ?? deviceTimeZone());
const zoneLabel = computed(() => timeZoneLabel(new Date().toISOString(), zone.value, intlLocale(locale.value)));

const patientName = computed(() => {
  if (props.appointment) return props.appointment.patient_name ?? "";
  if (fixedPatient.value) return fixedPatient.value.name;
  return patientOptions.value.find((p) => p.id === patientId.value)?.name ?? "";
});
const practitionerName = computed(() => {
  if (props.appointment) return props.appointment.practitioner_name ?? "";
  if (fixedPractitioner.value) return fixedPractitioner.value.name;
  return "";
});
const patientDefaultPractitionerId = computed(() => {
  if (fixedPatient.value) return fixedPatient.value.practitioner_id ?? null;
  return patientOptions.value.find((p) => p.id === patientId.value)?.practitioner_id ?? null;
});

const durationItems = computed(() =>
  APPOINTMENT_DURATIONS.map((m) => ({ value: m, title: t("user.appointments.form.minutes", { n: m }) })),
);

const required = (v: unknown) => !!v || t("app.formRenderer.validation.required");

/** Next full hour, as a wall-clock value in `zone`. */
function nextFullHour(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toZonedInputValue(d.toISOString(), zone.value);
}

function reset() {
  problem.value = null;
  const a = props.appointment;
  patientId.value = a?.patient_id ?? fixedPatient.value?.id ?? null;
  practitionerId.value = a?.practitioner_id ?? fixedPractitioner.value?.id ?? fixedPatient.value?.practitioner_id ?? null;
  startWall.value = a ? toZonedInputValue(a.start_at, zone.value) : props.startAt ? toZonedInputValue(props.startAt, zone.value) : nextFullHour();
  duration.value = a ? Math.round((new Date(a.end_at).getTime() - new Date(a.start_at).getTime()) / 60_000) : DEFAULT_APPOINTMENT_DURATION;
  notes.value = a?.notes ?? "";
}

async function loadOptions(path: string, target: typeof patientOptions, loading: typeof loadingPatients) {
  if (target.value.length) return;
  loading.value = true;
  try {
    const res = await apiFetch(path, { handleErrors: false });
    if (res.ok) target.value = ((await res.json()) as { items?: NamedRef[] }).items ?? [];
  } catch (err) {
    reportCaught(err, { where: "AppointmentDialog.loadOptions" });
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    reset();
    if (!isEdit.value && !fixedPatient.value) void loadOptions("/api/v1/patient?limit=-1", patientOptions, loadingPatients);
    if (!isEdit.value && !fixedPractitioner.value && !isDoctor.value) {
      void loadOptions("/api/v1/practitioner?limit=-1", practitionerOptions, loadingPractitioners);
    }
  },
  { immediate: true },
);

// Picking a patient pre-selects their assigned doctor (Łukasz, 2026-09-26) — still changeable.
watch(patientId, () => {
  if (!isEdit.value && !fixedPractitioner.value && patientDefaultPractitionerId.value) {
    practitionerId.value = patientDefaultPractitionerId.value;
  }
});

function close() {
  emit("update:modelValue", false);
}

function explain(result: AppointmentWriteResult): string {
  if (result.conflict) return t("user.appointments.form.slotTaken");
  if (result.forbidden) return isDoctor.value ? t("user.appointments.form.onlyOwnPatients") : t("user.appointments.form.outsideScope");
  return t("user.appointments.form.errorSave");
}

async function onSubmit() {
  const valid = (await formRef.value?.validate())?.valid ?? true;
  if (!valid || !startWall.value) return;
  problem.value = null;
  submitting.value = true;
  try {
    const startAt = zonedInputToIso(startWall.value, zone.value);
    const result = props.appointment
      ? await update(props.appointment.id, {
          start_at: startAt,
          duration_minutes: duration.value,
          ...(isFieldForce.value ? {} : { notes: notes.value.trim() || null }),
        })
      : await create({
          patient_id: patientId.value!,
          practitioner_id: isDoctor.value ? undefined : practitionerId.value ?? undefined,
          start_at: startAt,
          duration_minutes: duration.value,
          ...(isFieldForce.value || !notes.value.trim() ? {} : { notes: notes.value.trim() }),
        });
    if (!result.ok || !result.appointment) {
      problem.value = explain(result);
      return;
    }
    notifications.show(
      isEdit.value ? t("user.appointments.form.editSuccess") : t("user.appointments.form.success"),
      "success",
      undefined,
      { icon: "nav-appointments", context: result.appointment.patient_name ?? undefined },
    );
    emit("saved", result.appointment);
    close();
  } catch (err) {
    reportCaught(err, { where: "AppointmentDialog.onSubmit" });
    problem.value = t("user.appointments.form.errorSave");
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.appointment-dialog__fixed {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.appointment-dialog__label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.appointment-dialog__tz {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
