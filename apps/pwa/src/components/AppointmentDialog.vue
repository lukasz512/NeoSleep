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
          <FormErrorSummary :errors="errorList" :title="t('app.formRenderer.errorSummary.title', { n: errorList.length })" @select="focusField" />

          <p v-if="isEdit || fixedPatient" class="appointment-dialog__fixed mb-3">
            <span class="appointment-dialog__label">{{ t('user.appointments.form.fieldPatient') }}</span>
            <span>{{ patientName }}</span>
          </p>
          <VAutocomplete
            v-else
            :ref="(el) => setFieldEl('patient', el)"
            v-model="patientId"
            :error-messages="serverError('patient')"
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
            :ref="(el) => setFieldEl('practitioner', el)"
            v-model="practitionerId"
            :error-messages="serverError('practitioner')"
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

          <!-- CORE-132 D4: a doctor outside the care team gets the patient's record — the booker confirms it. -->
          <div v-if="needsGrant" class="appointment-dialog__grant mb-3" data-testid="appointment-grant">
            <p class="appointment-dialog__grant-hint">{{ t('user.appointments.form.grantAccessHint', { doctor: chosenDoctorName }) }}</p>
            <VCheckbox
              :ref="(el) => setFieldEl('grantAccess', el)"
              v-model="grantAccess"
              :label="t('user.appointments.form.grantAccess')"
              :error-messages="serverError('grantAccess')"
              :rules="[required]"
              density="compact"
              hide-details="auto"
              data-testid="appointment-grant-checkbox"
            />
          </div>

          <!-- Date | Time side by side (NEO-132, T2); taken slots of this doctor are struck through. -->
          <AppDateField
            :ref="(el) => setFieldEl('start', el)"
            v-model="startWall"
            mode="datetime"
            :error-messages="serverError('start')"
            :label="t('user.appointments.form.fieldDate')"
            :min="isEdit ? undefined : 'today'"
            quick-picks="future"
            :busy="takenSlots"
            :busy-duration="duration"
            class="mb-3"
            :rules="[required]"
            test-id="appointment-start"
          />
          <VSelect
            :ref="(el) => setFieldEl('duration', el)"
            v-model="duration"
            :error-messages="serverError('duration')"
            :label="t('user.appointments.form.fieldDuration')"
            :items="durationItems"
            variant="outlined"
            density="comfortable"
            class="mb-3"
          />

          <VTextarea
            v-if="!isFieldForce"
            :ref="(el) => setFieldEl('notes', el)"
            v-model="notes"
            :error-messages="serverError('notes')"
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
import { ref, computed, watch, nextTick, type ComponentPublicInstance } from "vue";
import { useI18n } from "vue-i18n";
import { reportCaught } from "@api";
import { apiFetch } from "../composables/useApi";
import { useFormErrors, focusFormField, type FieldErrors, type FormErrorField } from "../composables/useFormErrors";
import { scrollToFormTop } from "../utils/scrollToFormTop";
import { useNotifications } from "../composables/useNotifications";
import {
  useAppointments,
  APPOINTMENT_DURATIONS,
  DEFAULT_APPOINTMENT_DURATION,
  type Appointment,
  type AppointmentWriteResult,
} from "../composables/useAppointments";
import {
  deviceTimeZone,
  toZonedInputValue,
  zonedInputToIso,
  timeZoneLabel,
  takenIntervalsOnDay,
  defaultBookingWall,
} from "../utils/appointmentTime";
import { addDaysIso } from "../utils/dateField";
import { intlLocale } from "@i18n/language-options";
import AppButton from "./AppButton.vue";
import AppAvatar from "./AppAvatar.vue";
import AppIcon from "./AppIcon.vue";
import AppFormDialog from "./AppFormDialog.vue";
import AppDateField from "./AppDateField.vue";
import { AppInlineAlert, FormErrorSummary } from "@ui";

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
  /** Pre-filled start as an instant ("book next"). */
  startAt?: string | null;
  /** Pre-filled start as wall time "YYYY-MM-DDTHH:mm" (calendar slot click) — kept as is in the clinic zone (CORE-120). */
  startLocal?: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [appointment: Appointment];
}>();

const { t, locale } = useI18n();
const notifications = useNotifications();
const { isFieldForce, isDoctor, create, update } = useAppointments();

const formRef = ref<{ validate: () => Promise<{ valid: boolean }>; $el?: Element } | null>(null);
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
/**
 * Times are entered in the clinic's zone: an existing appointment keeps its
 * own; a new one asks the API which clinic zone it will be booked in
 * (CORE-120 — the device zone put a PL admin's 15:00 at an MX clinic at
 * 07:00). The device zone only bridges the moment before that answer.
 */
const clinicZone = ref<string | null>(null);
const zone = computed(() => props.appointment?.timezone ?? clinicZone.value ?? deviceTimeZone());
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

/**
 * CORE-132: who is already on the chosen patient's care team (primary doctor included).
 * null until known — no confirmation is asked for before then; the API still enforces it.
 */
const careTeamIds = ref<Set<string> | null>(null);
const grantAccess = ref(false);
/** CORE-138: the API said grant_access is required although the team list didn't (failed or stale) — ask now. */
const grantRequiredByServer = ref(false);
const needsGrant = computed(
  () =>
    !isEdit.value &&
    !isDoctor.value &&
    !!practitionerId.value &&
    (grantRequiredByServer.value || (!!careTeamIds.value && !careTeamIds.value.has(practitionerId.value))),
);
const chosenDoctorName = computed(
  () => fixedPractitioner.value?.name ?? practitionerOptions.value.find((p) => p.id === practitionerId.value)?.name ?? "",
);

watch(
  [() => props.modelValue, patientId],
  async ([open, patient]) => {
    careTeamIds.value = null;
    if (!open || !patient || isEdit.value || isDoctor.value) return;
    try {
      const res = await apiFetch(`/api/v1/patient/${patient}/care-team`, { handleErrors: false });
      if (!res.ok || patientId.value !== patient) return;
      const team: unknown = await res.json();
      if (Array.isArray(team)) careTeamIds.value = new Set((team as { practitioner_id: string }[]).map((m) => m.practitioner_id));
    } catch (err) {
      reportCaught(err, { where: "AppointmentDialog.careTeam" });
    }
  },
  { immediate: true },
);
watch(practitionerId, () => {
  grantAccess.value = false;
  grantRequiredByServer.value = false;
  clearServerError("grantAccess");
});
watch(grantAccess, () => clearServerError("grantAccess"));

const durationItems = computed(() =>
  APPOINTMENT_DURATIONS.map((m) => ({ value: m, title: t("user.appointments.form.minutes", { n: m }) })),
);

const required = (v: unknown) => !!v || t("app.formRenderer.validation.required");

/** API payload key → the field that edits it, so a 400 naming the key marks that field (NEO-109). */
const API_TO_FORM_KEY: Record<string, string> = {
  patient_id: "patient",
  practitioner_id: "practitioner",
  start_at: "start",
  start_local: "start",
  duration_minutes: "duration",
  notes: "notes",
  grant_access: "grantAccess",
};

/**
 * Errors show in the form, never as a toast (NEO-109) — same pattern as
 * FormRenderer: under the field, in the summary box on top, only after the
 * first Save; a field the API rejected clears as soon as it's edited.
 * What no field can fix (slot taken, out of scope) stays in `problem`.
 */
const { attempted, serverError, clearServerError, setServerErrors, reset: resetErrors, errorListFor } = useFormErrors();

const errorFields = computed<FormErrorField[]>(() => {
  const fields: FormErrorField[] = [];
  if (!isEdit.value && !fixedPatient.value) {
    fields.push({ key: "patient", label: t("user.appointments.form.fieldPatient"), value: patientId.value, rules: [required] });
  }
  if (!isEdit.value && !fixedPractitioner.value && !isDoctor.value) {
    fields.push({ key: "practitioner", label: t("user.appointments.form.fieldDoctor"), value: practitionerId.value, rules: [required] });
  }
  if (needsGrant.value) {
    fields.push({ key: "grantAccess", label: t("user.appointments.form.grantAccess"), value: grantAccess.value, rules: [required] });
  }
  fields.push(
    { key: "start", label: t("user.appointments.form.fieldStart"), value: startWall.value, rules: [required] },
    { key: "duration", label: t("user.appointments.form.fieldDuration"), value: duration.value },
  );
  if (!isFieldForce.value) fields.push({ key: "notes", label: t("user.appointments.form.fieldNotes"), value: notes.value });
  return fields;
});
const errorList = errorListFor(() => errorFields.value);

watch(patientId, () => clearServerError("patient"));
watch(practitionerId, () => clearServerError("practitioner"));
watch(startWall, () => clearServerError("start"));
watch(duration, () => clearServerError("duration"));
watch(notes, () => clearServerError("notes"));

const fieldEls: Record<string, Element> = {};
function setFieldEl(key: string, el: Element | ComponentPublicInstance | null) {
  if (!el) delete fieldEls[key];
  else fieldEls[key] = el instanceof Element ? el : el.$el;
}
/** The summary's links jump to their field. */
function focusField(key: string) {
  focusFormField(fieldEls[key]);
}

/** Marks the fields the API rejected; false when none of them is on this form (the caller then explains inline). */
function showServerErrors(fieldErrors: FieldErrors): boolean {
  const mapped: FieldErrors = {};
  for (const [apiKey, reason] of Object.entries(fieldErrors)) {
    const key = API_TO_FORM_KEY[apiKey];
    if (key) mapped[key] = reason;
  }
  if (!setServerErrors(mapped, errorFields.value.map((f) => f.key))) return false;
  nextTick(() => scrollToFormTop(formRef.value?.$el));
  return true;
}

/**
 * The instant the form opened on (slot click, "book next") — re-read as wall
 * time when the clinic zone arrives, until the user edits it.
 */
let initialStart: string | null = null;
/** Set when the form opened on the default (tomorrow, CORE-167) — re-derived per zone the same way. */
let openedAt: Date | null = null;

function reset() {
  problem.value = null;
  grantRequiredByServer.value = false;
  resetErrors();
  clinicZone.value = null;
  const a = props.appointment;
  patientId.value = a?.patient_id ?? fixedPatient.value?.id ?? null;
  practitionerId.value = a?.practitioner_id ?? fixedPractitioner.value?.id ?? fixedPatient.value?.practitioner_id ?? null;
  initialStart = a?.start_at ?? (props.startLocal ? null : props.startAt) ?? null;
  openedAt = null;
  if (!a && props.startLocal) {
    startWall.value = props.startLocal;
  } else if (initialStart) {
    startWall.value = toZonedInputValue(initialStart, zone.value);
  } else {
    openedAt = new Date();
    startWall.value = defaultBookingWall(openedAt, zone.value, deviceTimeZone());
  }
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

/**
 * The chosen doctor's bookings that day, so the time list shows what's taken
 * before Save instead of a 409 after it. A doctor booking for themself needs
 * no filter — the API already scopes their list to their own visits.
 */
const takenSlots = ref<{ start: string; end: string }[]>([]);
const bookingDay = computed(() => (startWall.value ? startWall.value.slice(0, 10) : ""));
watch(
  [() => props.modelValue, bookingDay, practitionerId, zone],
  async ([open, day, doctorId]) => {
    takenSlots.value = [];
    if (!open || !day || (!doctorId && !isDoctor.value)) return;
    const from = zonedInputToIso(`${day}T00:00`, zone.value);
    const to = zonedInputToIso(`${addDaysIso(day, 1)}T00:00`, zone.value);
    const query = new URLSearchParams({ start: from, end: to });
    if (doctorId && !isDoctor.value) query.set("practitioner_id", doctorId);
    try {
      const res = await apiFetch(`/api/v1/appointments?${query.toString()}`, { handleErrors: false });
      if (!res.ok || bookingDay.value !== day) return;
      const items = ((await res.json()) as { items?: Appointment[] }).items ?? [];
      takenSlots.value = takenIntervalsOnDay(items, day, zone.value, props.appointment?.id);
    } catch (err) {
      reportCaught(err, { where: "AppointmentDialog.takenSlots" });
    }
  },
  { immediate: true },
);

/** The clinic zone a new booking for this doctor (or, for a doctor booking themself, this patient) lands in. */
watch(
  [() => props.modelValue, practitionerId, patientId],
  async ([open, doctorId, patient]) => {
    if (!open || isEdit.value) return;
    const query = new URLSearchParams();
    if (doctorId) query.set("practitioner_id", doctorId);
    else if (patient) query.set("patient_id", patient);
    else return;
    try {
      const res = await apiFetch(`/api/v1/appointments/booking-zone?${query.toString()}`, { handleErrors: false });
      if (!res.ok) return;
      const { timezone } = (await res.json()) as { timezone?: string };
      if (timezone && practitionerId.value === doctorId) clinicZone.value = timezone;
    } catch (err) {
      reportCaught(err, { where: "AppointmentDialog.bookingZone" });
    }
  },
  { immediate: true },
);

// A zone change re-reads the opening instant in the new zone — unless the user already picked a time.
watch(zone, (now, before) => {
  if (initialStart && startWall.value === toZonedInputValue(initialStart, before)) {
    startWall.value = toZonedInputValue(initialStart, now);
  } else if (openedAt && startWall.value === defaultBookingWall(openedAt, before, deviceTimeZone())) {
    startWall.value = defaultBookingWall(openedAt, now, deviceTimeZone());
  }
});

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
  attempted.value = true;
  const valid = (await formRef.value?.validate())?.valid ?? true;
  if (!valid || !startWall.value || errorList.value.length) {
    scrollToFormTop(formRef.value?.$el);
    return;
  }
  problem.value = null;
  submitting.value = true;
  try {
    // Wall-clock as shown; the API converts it in the clinic's zone (CORE-120).
    const startLocal = startWall.value;
    const result = props.appointment
      ? await update(props.appointment.id, {
          start_local: startLocal,
          duration_minutes: duration.value,
          ...(isFieldForce.value ? {} : { notes: notes.value.trim() || null }),
        })
      : await create({
          patient_id: patientId.value!,
          practitioner_id: isDoctor.value ? undefined : practitionerId.value ?? undefined,
          start_local: startLocal,
          duration_minutes: duration.value,
          ...(isFieldForce.value || !notes.value.trim() ? {} : { notes: notes.value.trim() }),
          ...(needsGrant.value && grantAccess.value ? { grant_access: true } : {}),
        });
    if (!result.ok || !result.appointment) {
      if (result.fieldErrors?.grant_access && !isEdit.value) grantRequiredByServer.value = true;
      if (!(result.fieldErrors && showServerErrors(result.fieldErrors))) problem.value = explain(result);
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

.appointment-dialog__grant-hint {
  font-size: 0.8125rem;
  margin: 0 0 4px;
}

.appointment-dialog__tz {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
