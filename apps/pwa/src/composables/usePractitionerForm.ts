import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useSalutationOptions } from "./useSalutationOptions";
import type {
  PractitionerFormData,
  PractitionerFormInitialData,
  PractitionerSubmitPayload,
} from "../components/PractitionerForm.types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function usePractitionerForm(
  props: { modelValue: boolean; initialData?: PractitionerFormInitialData },
  emit: (event: "update:modelValue" | "submit", ...args: unknown[]) => void,
) {
  const { t } = useI18n();
  const { salutationItems } = useSalutationOptions();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
  const submitting = ref(false);
  const showDiscardConfirm = ref(false);
  const initialFormSnapshot = ref<PractitionerFormData | null>(null);

  const form = ref<PractitionerFormData>({
    salutation: "", first_name: "", last_name: "", email: "", phone: "",
    primary_specialty: "", institution: "", region: "", influence_tier: "C",
    language: "", national_id: "",
  });

  const influenceTierItems = [
    { title: "A", value: "A" },
    { title: "B", value: "B" },
    { title: "C", value: "C" },
    { title: "D", value: "D" },
  ];

  const isEditMode  = computed(() => !!props.initialData?.id);
  const formTitle   = computed(() => t("user.hcp.form.title"));
  const formSubmitLabel = computed(() => t("user.hcp.form.submit"));

  const firstNameRules = computed(() => [
    (v: string) => !!v?.trim() || t("user.hcp.form.validation.firstNameRequired"),
  ]);

  const lastNameRules = computed(() => [
    (v: string) => !!v?.trim() || t("user.hcp.form.validation.lastNameRequired"),
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
      if (!/^\d+$/.test(digits)) return t("user.hcp.form.validation.phoneDigitsOnly");
      return digits.length >= 9 || t("user.hcp.form.validation.phoneMinDigits");
    },
  ]);

  function nationalIdFrom(ids?: Record<string, string> | null): string {
    if (!ids) return "";
    const values = Object.values(ids);
    return values[0] ?? "";
  }

  function hasFormChanged(): boolean {
    const snap = initialFormSnapshot.value;
    if (!snap) return false;
    const f = form.value;
    const eq = (a: string, b: string) => (a ?? "").trim() === (b ?? "").trim();
    return (
      !eq(f.salutation, snap.salutation) || !eq(f.first_name, snap.first_name) ||
      !eq(f.last_name, snap.last_name) || !eq(f.email, snap.email) || !eq(f.phone, snap.phone) ||
      !eq(f.primary_specialty, snap.primary_specialty) || !eq(f.institution, snap.institution) ||
      !eq(f.region, snap.region) || f.influence_tier !== snap.influence_tier ||
      !eq(f.language, snap.language) || !eq(f.national_id, snap.national_id)
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
      const nationalId = form.value.national_id.trim();
      const payload: PractitionerSubmitPayload = {
        id:                props.initialData?.id,
        salutation:        form.value.salutation.trim() || undefined,
        first_name:        form.value.first_name.trim(),
        last_name:         form.value.last_name.trim(),
        email:             form.value.email.trim() || undefined,
        phone:             form.value.phone.replace(/\D/g, "") || undefined,
        primary_specialty: form.value.primary_specialty.trim() || undefined,
        institution:       form.value.institution.trim() || undefined,
        region:            form.value.region.trim() || undefined,
        influence_tier:    form.value.influence_tier || undefined,
        language:          form.value.language.trim() || undefined,
        national_ids:      nationalId ? { primary: nationalId } : null,
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
            salutation:        (initial.salutation ?? "").trim(),
            first_name:        (initial.first_name ?? "").trim(),
            last_name:         (initial.last_name ?? "").trim(),
            email:             (initial.email ?? "").trim(),
            phone:             (initial.phone ?? "").replace(/\D/g, ""),
            primary_specialty: (initial.primary_specialty ?? initial.specialty ?? "").trim(),
            institution:       (initial.institution ?? "").trim(),
            region:            (initial.region ?? "").trim(),
            influence_tier:    initial.influence_tier ?? "C",
            language:          (initial.language ?? "").trim(),
            national_id:       nationalIdFrom(initial.national_ids),
          };
        } else {
          form.value = {
            salutation: "", first_name: "", last_name: "", email: "", phone: "",
            primary_specialty: "", institution: "", region: "", influence_tier: "C",
            language: "", national_id: "",
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
    influenceTierItems, salutationItems,
    isEditMode, formTitle, formSubmitLabel,
    firstNameRules, lastNameRules, emailRules, phoneRules,
    onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
  };
}
