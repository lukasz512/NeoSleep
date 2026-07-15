import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useSalutationOptions } from "./useSalutationOptions";
import type { LeadFormData, LeadFormInitialData, LeadSubmitPayload } from "../components/LeadForm.types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useLeadForm(
  props: { modelValue: boolean; initialData?: LeadFormInitialData },
  emit: (event: "update:modelValue" | "submit", ...args: unknown[]) => void,
) {
  const { t } = useI18n();
  const { salutationItems } = useSalutationOptions();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
  const submitting = ref(false);
  const showDiscardConfirm = ref(false);
  const initialFormSnapshot = ref<LeadFormData | null>(null);

  const form = ref<LeadFormData>({
    salutation: "", first_name: "", last_name: "", email: "", phone: "", status: "new", region: "", institution: "",
  });

  // converted isn't offered here — it's a system transition (ConvertLeadCommand,
  // triggered by "move to contacts"), not something a user picks manually.
  const statusItems = computed(() => [
    { title: t("user.leads.filters.statusNew"),       value: "new" },
    { title: t("user.leads.filters.statusContacted"), value: "contacted" },
    { title: t("user.leads.filters.statusQualified"), value: "qualified" },
    { title: t("user.leads.filters.statusInactive"),  value: "inactive" },
  ]);

  const isEditMode  = computed(() => !!props.initialData?.id);
  const formTitle   = computed(() => isEditMode.value ? t("user.leads.form.editTitle") : t("user.leads.form.title"));
  const formSubmitLabel = computed(() => isEditMode.value ? t("user.leads.form.editSubmit") : t("user.leads.form.submit"));

  const firstNameRules = computed(() => [
    (v: string) => !!v?.trim() || t("user.leads.form.validation.firstNameRequired"),
  ]);

  const emailRules = computed(() => [
    (v: string) => {
      const s = (v ?? "").trim();
      if (!s) return true;
      return EMAIL_REGEX.test(s) || t("user.leads.form.validation.emailInvalid");
    },
  ]);

  const phoneRules = computed(() => [
    (v: string) => {
      const digits = (v ?? "").replace(/\D/g, "");
      if (!digits) return true;
      return /^\d+$/.test(digits) || t("user.hcp.form.validation.phoneDigitsOnly");
    },
  ]);

  function hasFormChanged(): boolean {
    const snap = initialFormSnapshot.value;
    if (!snap) return false;
    const f = form.value;
    const eq = (a: string, b: string) => (a ?? "").trim() === (b ?? "").trim();
    return (
      !eq(f.salutation, snap.salutation) ||
      !eq(f.first_name, snap.first_name) || !eq(f.last_name, snap.last_name) ||
      !eq(f.email, snap.email) || !eq(f.phone, snap.phone) ||
      f.status !== snap.status || !eq(f.region, snap.region) || !eq(f.institution, snap.institution)
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
      const firstName = form.value.first_name.trim();
      // A single-word name is common for legacy/quick-add leads — fall back to
      // first name so the backend's "last_name required" rule never blocks submit.
      const lastName = form.value.last_name.trim() || firstName;
      const payload: LeadSubmitPayload = {
        id:          props.initialData?.id,
        salutation:  form.value.salutation.trim() || undefined,
        first_name:  firstName,
        last_name:   lastName,
        email:       form.value.email.trim() || undefined,
        phone:       form.value.phone.replace(/\D/g, "") || undefined,
        status:      form.value.status || "new",
        region:      form.value.region.trim() || undefined,
        institution: form.value.institution.trim() || undefined,
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
        if (initial && initial.id) {
          form.value = {
            salutation:  (initial.salutation ?? "").trim(),
            first_name:  (initial.first_name ?? "").trim(),
            last_name:   (initial.last_name ?? "").trim(),
            email:       (initial.email ?? "").trim(),
            phone:       (initial.phone ?? "").replace(/\D/g, ""),
            status:      (initial.status ?? "new").trim(),
            region:      (initial.region ?? "").trim(),
            institution: (initial.institution ?? "").trim(),
          };
        } else {
          form.value = {
            salutation: "", first_name: "", last_name: "", email: "", phone: "", status: "new", region: "", institution: "",
          };
        }
        initialFormSnapshot.value = { ...form.value };
      } else {
        initialFormSnapshot.value = null;
      }
    },
  );

  return {
    formRef, form, submitting, showDiscardConfirm,
    statusItems, salutationItems,
    isEditMode, formTitle, formSubmitLabel,
    firstNameRules, emailRules, phoneRules,
    onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
  };
}
