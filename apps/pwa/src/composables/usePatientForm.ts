import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "../utils/api";
import type {
  PatientFormData,
  PatientFormInitialData,
  PatientSubmitPayload,
} from "../components/PatientForm.types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// DB CHECK constraint patient_status_check (infrastructure/db/schema-snapshot.sql) —
// real value is `follow_up` (underscore), NOT `follow-up`. Keep in sync with
// PatientsView.vue's filter options and commands/patient.ts on the backend.
const PATIENT_STATUS_VALUES = ["active", "follow_up", "discharged"] as const;

const emptyForm = (): PatientFormData => ({
  salutation: "", first_name: "", last_name: "", email: "", phone: "",
  practitioner_id: "", status: "active", region: "",
  ahi_baseline: "", cpap_device: "", medical_record: "",
});

export function usePatientForm(
  props: { modelValue: boolean; initialData?: PatientFormInitialData },
  emit: (event: "update:modelValue" | "submit", ...args: unknown[]) => void,
) {
  const { t } = useI18n();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
  const submitting = ref(false);
  const showDiscardConfirm = ref(false);
  const initialFormSnapshot = ref<PatientFormData | null>(null);
  const practitionerOptions = ref<{ id: string; name: string }[]>([]);
  const loadingPractitioners = ref(false);

  const form = ref<PatientFormData>(emptyForm());

  const statusItems = computed(() =>
    PATIENT_STATUS_VALUES.map((value) => ({
      value,
      title: t(`app.patients.filters.status${value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")}`),
    }))
  );

  const isEditMode  = computed(() => !!props.initialData?.id);
  const formTitle   = computed(() => isEditMode.value ? t("app.patients.form.editTitle") : t("app.patients.form.title"));
  const formSubmitLabel = computed(() => isEditMode.value ? t("app.patients.form.editSubmit") : t("app.patients.form.submit"));

  const firstNameRules = computed(() => [
    (v: string) => !!v?.trim() || t("app.patients.form.validation.firstNameRequired"),
  ]);

  const lastNameRules = computed(() => [
    (v: string) => !!v?.trim() || t("app.patients.form.validation.lastNameRequired"),
  ]);

  const emailRules = computed(() => [
    (v: string) => {
      const s = (v ?? "").trim();
      if (!s) return true;
      return EMAIL_REGEX.test(s) || t("app.patients.form.validation.emailInvalid");
    },
  ]);

  const phoneRules = computed(() => [
    (v: string) => {
      const digits = (v ?? "").replace(/\D/g, "");
      if (!digits) return true;
      if (!/^\d+$/.test(digits)) return t("app.patients.form.validation.phoneDigitsOnly");
      return digits.length >= 9 || t("app.patients.form.validation.phoneMinDigits");
    },
  ]);

  const ahiBaselineRules = computed(() => [
    (v: string) => {
      const s = (v ?? "").trim();
      if (!s) return true;
      return !Number.isNaN(Number(s)) || t("app.patients.form.validation.ahiBaselineInvalid");
    },
  ]);

  async function loadPractitioners() {
    loadingPractitioners.value = true;
    try {
      const res = await apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false });
      if (res.ok) {
        const json = (await res.json()) as { items?: { id: string; name: string }[] };
        practitionerOptions.value = json.items ?? [];
      }
    } finally {
      loadingPractitioners.value = false;
    }
  }

  function hasFormChanged(): boolean {
    const snap = initialFormSnapshot.value;
    if (!snap) return false;
    const f = form.value;
    const eq = (a: string, b: string) => (a ?? "").trim() === (b ?? "").trim();
    return (
      !eq(f.salutation, snap.salutation) || !eq(f.first_name, snap.first_name) ||
      !eq(f.last_name, snap.last_name) || !eq(f.email, snap.email) || !eq(f.phone, snap.phone) ||
      !eq(f.practitioner_id, snap.practitioner_id) || f.status !== snap.status ||
      !eq(f.region, snap.region) || !eq(f.ahi_baseline, snap.ahi_baseline) ||
      !eq(f.cpap_device, snap.cpap_device) || !eq(f.medical_record, snap.medical_record)
    );
  }

  function onDialogUpdate(value: boolean) {
    if (value === false && hasFormChanged()) {
      showDiscardConfirm.value = true;
    } else {
      emit("update:modelValue", value);
    }
  }

  function confirmDiscard() {
    showDiscardConfirm.value = false;
    emit("update:modelValue", false);
  }

  function onCancelClick() {
    if (hasFormChanged()) {
      showDiscardConfirm.value = true;
    } else {
      emit("update:modelValue", false);
    }
  }

  async function onSubmit() {
    const valid = await formRef.value?.validate();
    if (!valid?.valid) return;
    submitting.value = true;
    try {
      const ahiTrimmed = form.value.ahi_baseline.trim();
      const ahiParsed = ahiTrimmed ? Number(ahiTrimmed) : undefined;
      const payload: PatientSubmitPayload = {
        id:              props.initialData?.id,
        salutation:      form.value.salutation.trim() || undefined,
        first_name:      form.value.first_name.trim(),
        last_name:       form.value.last_name.trim(),
        email:           form.value.email.trim() || undefined,
        phone:           form.value.phone.replace(/\D/g, "") || undefined,
        practitioner_id: form.value.practitioner_id || undefined,
        status:          form.value.status || undefined,
        region:          form.value.region.trim() || undefined,
        ahi_baseline:    ahiParsed !== undefined && !Number.isNaN(ahiParsed) ? ahiParsed : undefined,
        cpap_device:     form.value.cpap_device.trim() || undefined,
        medical_record:  form.value.medical_record.trim() || undefined,
      };
      emit("submit", payload);
      emit("update:modelValue", false);
    } finally {
      submitting.value = false;
    }
  }

  watch(
    () => [props.modelValue, props.initialData] as const,
    ([open, initial]) => {
      if (open) {
        loadPractitioners();
        if (initial && initial.id) {
          form.value = {
            salutation:      (initial.salutation ?? "").trim(),
            first_name:      (initial.first_name ?? "").trim(),
            last_name:       (initial.last_name ?? "").trim(),
            email:           (initial.email ?? "").trim(),
            phone:           (initial.phone ?? "").replace(/\D/g, ""),
            practitioner_id: (initial.practitioner_id ?? "").trim(),
            status:          initial.status ?? "active",
            region:          (initial.region ?? "").trim(),
            ahi_baseline:    initial.ahi_baseline != null ? String(initial.ahi_baseline) : "",
            cpap_device:     (initial.cpap_device ?? "").trim(),
            medical_record:  (initial.medical_record ?? "").trim(),
          };
        } else {
          form.value = emptyForm();
        }
        initialFormSnapshot.value = { ...form.value };
      } else {
        initialFormSnapshot.value = null;
      }
    },
  );

  return {
    formRef, form, submitting, showDiscardConfirm,
    practitionerOptions, loadingPractitioners,
    statusItems,
    isEditMode, formTitle, formSubmitLabel,
    firstNameRules, lastNameRules, emailRules, phoneRules, ahiBaselineRules,
    onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
  };
}
