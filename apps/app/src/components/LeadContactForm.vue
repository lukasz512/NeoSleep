<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="lead-contact-form-dialog__content"
    class="lead-contact-form-dialog"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="lead-contact-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6">
        {{ formTitle }}
      </VCardTitle>
      <VCardText>
        <VAlert
          v-if="showVerifyInfo"
          type="info"
          variant="tonal"
          density="comfortable"
          border="start"
          color="primary"
          border-color="primary"
          rounded="lg"
          class="mb-6"
        >
          {{ t('rep.leads.form.verifyDataInfo') }}
        </VAlert>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VTextField
            v-model="form.name"
            :label="t('rep.leads.form.name')"
            :rules="nameRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="name"
          />
          <VTextField
            v-model="form.email"
            type="email"
            :label="t('rep.leads.form.email')"
            :rules="emailRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="email"
          />
          <template v-if="mode === 'contact'">
            <VTextField
              :model-value="form.phone"
              :label="t('rep.hcp.form.phone')"
              :placeholder="t('rep.hcp.form.phonePlaceholder')"
              :rules="phoneRules"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              autocomplete="tel"
              @update:model-value="form.phone = ($event ?? '').replace(/\D/g, '')"
            >
              <template #prepend-inner>
                <span class="lead-contact-form__phone-prefix">+52</span>
              </template>
            </VTextField>
          </template>
          <div class="lead-contact-form__row mb-3">
            <template v-if="mode === 'lead'">
              <VSelect
                v-model="form.status"
                :label="t('rep.leads.form.status')"
                :items="statusItems"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="comfortable"
                class="lead-contact-form__row-item"
              />
            </template>
            <template v-if="mode === 'contact'">
              <VSelect
                v-model="form.specialty"
                :label="t('rep.hcp.form.specialty')"
                :items="specialtyItems"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="comfortable"
                class="lead-contact-form__row-item"
                clearable
              />
            </template>
            <VSelect
              v-model="form.region"
              :label="t('rep.leads.form.region')"
              :items="regionItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="lead-contact-form__row-item"
              clearable
            />
          </div>
          <VTextField
            v-model="form.institution"
            :label="t('rep.leads.form.institution')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="organization"
          />
        </VForm>
      </VCardText>
      <VCardActions class="mx-2 mb-2">
        <VSpacer />
        <VBtn variant="text" @click="onCancelClick">
          {{ t("app.common.cancel") }}
        </VBtn>
        <VBtn color="primary" :loading="submitting" @click="onSubmit">
          {{ formSubmitLabel }}
        </VBtn>
      </VCardActions>
    </VCard>

    <VDialog
      v-model="showDiscardConfirm"
      max-width="360"
      content-class="lead-contact-form-dialog__content"
      persistent
    >
      <VCard>
        <VCardText>{{ t("app.common.discardChanges") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="showDiscardConfirm = false">
            {{ t("app.common.cancel") }}
          </VBtn>
          <VBtn color="error" variant="text" @click="confirmDiscard">
            {{ t("app.common.discard") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useConfigStore } from "../stores/config";

export interface LeadFormData {
  name: string;
  email: string;
  status: string;
  region: string;
  institution: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  specialty: string;
  region: string;
  institution: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode: "lead" | "contact";
    /** When provided, form is in edit mode (pre-filled, different title/submit label). */
    initialData?: Partial<LeadFormData & ContactFormData>;
    /** Show info banner asking to verify data (e.g. when converting lead to contact). */
    showVerifyInfo?: boolean;
  }>(),
  { modelValue: false, showVerifyInfo: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [data: LeadFormData | ContactFormData];
}>();

const { t } = useI18n();
const configStore = useConfigStore();
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const submitting = ref(false);
const showDiscardConfirm = ref(false);

const form = ref({
  name: "",
  email: "",
  phone: "",
  status: "new",
  region: "",
  institution: "",
  specialty: "",
});

const statusItems = computed(() => [
  { title: t("rep.leads.filters.statusNew"), value: "new" },
  { title: t("rep.leads.filters.statusOngoing"), value: "ongoing" },
  { title: t("rep.leads.filters.statusAccepted"), value: "accepted" },
  { title: t("rep.leads.filters.statusRejected"), value: "rejected" },
]);

const regionItems = computed(() => [
  { title: t("rep.leads.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const specialtyItems = computed(() => configStore.specialtyItems);

const isEditMode = computed(() => !!props.initialData && Object.keys(props.initialData).length > 0);

const formTitle = computed(() => {
  if (props.mode === "lead") {
    return isEditMode.value ? t("rep.leads.form.editTitle") : t("rep.leads.form.title");
  }
  return t("rep.hcp.form.title");
});

const formSubmitLabel = computed(() => {
  if (props.mode === "lead") {
    return isEditMode.value ? t("rep.leads.form.editSubmit") : t("rep.leads.form.submit");
  }
  return t("rep.hcp.form.submit");
});

const nameRules = computed(() => [
  (v: string) => !!v?.trim() || t("rep.leads.form.validation.nameRequired"),
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailRules = computed(() => {
  const required = props.mode === "contact"
    ? [(v: string) => !!v?.trim() || t("rep.hcp.form.validation.emailRequired")]
    : [];
  const format = [
    (v: string) => {
      const s = (v ?? "").trim();
      if (!s) return true;
      return EMAIL_REGEX.test(s) || t("rep.leads.form.validation.emailInvalid");
    },
  ];
  return [...required, ...format];
});

function hasFormChanged(): boolean {
  const f = form.value;
  const init = props.initialData;
  const t = (s: string) => (s ?? "").trim();
  const digits = (s: string) => (s ?? "").replace(/\D/g, "");
  if (!init || Object.keys(init).length === 0) {
    return (f.name ?? "").trim() !== "" || (f.email ?? "").trim() !== "" || (f.phone ?? "").trim() !== "" ||
      (f.institution ?? "").trim() !== "" || (f.region ?? "").trim() !== "" || (f.specialty ?? "").trim() !== "";
  }
  return t(f.name) !== t(init.name ?? "") || t(f.email) !== t(init.email ?? "") ||
    digits(f.phone) !== digits(init.phone ?? "") || t(f.status) !== t(init.status ?? "new") ||
    t(f.region) !== t(init.region ?? "") || t(f.institution) !== t(init.institution ?? "") ||
    t(f.specialty) !== t(init.specialty ?? "");
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

const phoneRules = computed(() => {
  if (props.mode !== "contact") return [];
  return [
    (v: string) => !!v?.trim() || t("rep.hcp.form.validation.phoneRequired"),
    (v: string) => {
      const digits = (v ?? "").replace(/\D/g, "");
      return digits.length >= 10 || t("rep.hcp.form.validation.phoneMinDigits");
    },
    (v: string) => {
      const digits = (v ?? "").replace(/\D/g, "");
      return /^\d*$/.test(digits) || t("rep.hcp.form.validation.phoneDigitsOnly");
    },
  ];
});

async function onSubmit() {
  const valid = await formRef.value?.validate();
  if (!valid?.valid) return;
  submitting.value = true;
  try {
    const data: LeadFormData | ContactFormData =
      props.mode === "lead"
        ? {
            name: form.value.name.trim(),
            email: form.value.email.trim(),
            status: form.value.status,
            region: form.value.region,
            institution: form.value.institution.trim(),
          }
        : {
            name: form.value.name.trim(),
            email: form.value.email.trim(),
            phone: form.value.phone.replace(/\D/g, ""),
            specialty: form.value.specialty.trim(),
            region: form.value.region,
            institution: form.value.institution.trim(),
          };
    emit("submit", data);
    emit("update:modelValue", false);
  } finally {
    submitting.value = false;
  }
}

watch(
  () => [props.modelValue, props.initialData] as const,
  ([open, initial]) => {
    if (open) {
      if (initial && Object.keys(initial).length > 0) {
        form.value = {
          name: (initial.name ?? "").trim(),
          email: (initial.email ?? "").trim(),
          phone: (initial.phone ?? "").replace(/\D/g, ""),
          status: (initial.status ?? "new").trim(),
          region: (initial.region ?? "").trim(),
          institution: (initial.institution ?? "").trim(),
          specialty: (initial.specialty ?? "").trim(),
        };
      } else {
        form.value = {
          name: "",
          email: "",
          phone: "",
          status: "new",
          region: "",
          institution: "",
          specialty: "",
        };
      }
    }
  }
);
</script>

<style scoped>
.lead-contact-form__phone-prefix {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-inline-end: 4px;
}

.lead-contact-form__row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.lead-contact-form__row-item {
  flex: 1 1 180px;
  min-width: 0;
}
</style>

<style >
/* Project styling: modal border-radius from design tokens (not Vuetify default) */
.lead-contact-form-dialog__content {
  border-radius: var(--rep-modal-radius, 16px) !important;
  overflow: hidden;
}

.lead-contact-form-dialog__card {
  border-radius: var(--rep-modal-radius, 16px) !important;
}

/* Header and footer: more padding for breathing room; body: 24px */
.lead-contact-form-dialog__card :deep(.v-card-title) {
  padding: 32px 24px !important;
}

.lead-contact-form-dialog__card :deep(.v-card-text) {
  padding: 24px !important;
}

.lead-contact-form-dialog__card :deep(.v-card-actions) {
  padding: 24px 24px 32px !important;
}
</style>

