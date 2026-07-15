import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import type {
  OrganizationFormData,
  OrganizationFormInitialData,
  OrganizationSubmitPayload,
} from "../components/OrganizationForm.types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Basic URL-shape check — accepts an optional scheme, a host with at least one
// dot, and an optional path/query/fragment. Not a full RFC 3986 validator,
// just enough to catch obvious typos ("not a url") before it hits the DB.
const WEBSITE_REGEX = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

// DB CHECK constraint organization_status_check (infrastructure/db/schema-snapshot.sql) —
// keep in sync with commands/organization.ts's ORG_STATUSES on the backend.
const ORG_STATUS_VALUES = ["pending_approval", "active", "inactive"] as const;

const emptyForm = (): OrganizationFormData => ({
  name: "", type: "other", status: "active", region: "",
  address_line1: "", city: "", state: "", postal_code: "", country_code: "",
  phone: "", email: "", website: "",
});

export function useOrganizationForm(
  props: { modelValue: boolean; initialData?: OrganizationFormInitialData },
  emit: (event: "update:modelValue" | "submit", ...args: unknown[]) => void,
) {
  const { t } = useI18n();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
  const submitting = ref(false);
  const showDiscardConfirm = ref(false);
  const initialFormSnapshot = ref<OrganizationFormData | null>(null);

  const form = ref<OrganizationFormData>(emptyForm());

  // Organization "type" options are config-driven (configStore.institutionTypeItems,
  // backed by platform.lookups type='organization_type' — see db/lookup.ts), not
  // hardcoded here — the .vue template binds the select directly to that store.
  // There is no equivalent DB-driven lookup for "status", so its options are
  // defined locally from the DB CHECK constraint values below.
  const statusItems = computed(() =>
    ORG_STATUS_VALUES.map((value) => ({
      value,
      title: t(`user.hco.filters.status${value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")}`),
    }))
  );

  const isEditMode  = computed(() => !!props.initialData?.id);
  const formTitle   = computed(() => isEditMode.value ? t("user.hco.form.editTitle") : t("user.hco.form.title"));
  const formSubmitLabel = computed(() => isEditMode.value ? t("user.hco.form.editSubmit") : t("user.hco.form.submit"));

  const nameRules = computed(() => [
    (v: string) => !!v?.trim() || t("user.hco.form.validation.nameRequired"),
  ]);

  const emailRules = computed(() => [
    (v: string) => {
      const s = (v ?? "").trim();
      if (!s) return true;
      return EMAIL_REGEX.test(s) || t("user.hco.form.validation.emailInvalid");
    },
  ]);

  const websiteRules = computed(() => [
    (v: string) => {
      const s = (v ?? "").trim();
      if (!s) return true;
      return WEBSITE_REGEX.test(s) || t("user.hco.form.validation.websiteInvalid");
    },
  ]);

  const phoneRules = computed(() => [
    (v: string) => {
      const digits = (v ?? "").replace(/\D/g, "");
      if (!digits) return true;
      if (!/^\d+$/.test(digits)) return t("user.hco.form.validation.phoneDigitsOnly");
      return digits.length >= 9 || t("user.hco.form.validation.phoneMinDigits");
    },
  ]);

  function hasFormChanged(): boolean {
    const snap = initialFormSnapshot.value;
    if (!snap) return false;
    const f = form.value;
    const eq = (a: string, b: string) => (a ?? "").trim() === (b ?? "").trim();
    return (
      !eq(f.name, snap.name) || f.type !== snap.type || f.status !== snap.status ||
      !eq(f.region, snap.region) || !eq(f.address_line1, snap.address_line1) ||
      !eq(f.city, snap.city) || !eq(f.state, snap.state) ||
      !eq(f.postal_code, snap.postal_code) || !eq(f.country_code, snap.country_code) ||
      !eq(f.phone, snap.phone) || !eq(f.email, snap.email) || !eq(f.website, snap.website)
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
      const payload: OrganizationSubmitPayload = {
        id:            props.initialData?.id,
        name:          form.value.name.trim(),
        type:          form.value.type || undefined,
        status:        form.value.status || undefined,
        region:        form.value.region.trim() || undefined,
        address_line1: form.value.address_line1.trim() || undefined,
        city:          form.value.city.trim() || undefined,
        state:         form.value.state.trim() || undefined,
        postal_code:   form.value.postal_code.trim() || undefined,
        country_code:  form.value.country_code.trim() || undefined,
        phone:         form.value.phone.replace(/\D/g, "") || undefined,
        email:         form.value.email.trim() || undefined,
        website:       form.value.website.trim() || undefined,
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
            name:          (initial.name ?? "").trim(),
            type:          initial.type ?? "other",
            status:        initial.status ?? "active",
            region:        (initial.region ?? "").trim(),
            address_line1: (initial.address_line1 ?? "").trim(),
            city:          (initial.city ?? "").trim(),
            state:         (initial.state ?? "").trim(),
            postal_code:   (initial.postal_code ?? "").trim(),
            country_code:  (initial.country_code ?? "").trim(),
            phone:         (initial.phone ?? "").replace(/\D/g, ""),
            email:         (initial.email ?? "").trim(),
            website:       (initial.website ?? "").trim(),
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
    statusItems,
    isEditMode, formTitle, formSubmitLabel,
    nameRules, emailRules, websiteRules, phoneRules,
    onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
  };
}
