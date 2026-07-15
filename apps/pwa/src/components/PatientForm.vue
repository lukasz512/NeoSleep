<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="pwa-form-dialog__content"
    class="patient-form-dialog"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="pwa-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6">
        {{ formTitle }}
      </VCardTitle>
      <VCardText>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VTextField
            v-model="form.salutation"
            :label="t('app.patients.form.salutation')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="honorific-prefix"
          />
          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="form.first_name"
              :label="t('app.patients.form.firstName')"
              :rules="firstNameRules"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="given-name"
            />
            <VTextField
              v-model="form.last_name"
              :label="t('app.patients.form.lastName')"
              :rules="lastNameRules"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="family-name"
            />
          </div>
          <VTextField
            v-model="form.email"
            type="email"
            :label="t('app.patients.form.email')"
            :rules="emailRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="email"
          />
          <VTextField
            :model-value="form.phone"
            :label="t('app.patients.form.phone')"
            :rules="phoneRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="tel"
            @update:model-value="form.phone = ($event ?? '').replace(/\D/g, '')"
          />
          <VAutocomplete
            v-model="form.practitioner_id"
            :label="t('app.patients.form.practitioner')"
            :items="practitionerOptions"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            clearable
            :loading="loadingPractitioners"
          />
          <div class="pwa-form-row mb-3">
            <VSelect
              v-model="form.status"
              :label="t('app.patients.form.status')"
              :items="statusItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
            <VSelect
              v-model="form.region"
              :label="t('app.patients.form.region')"
              :items="configStore.regionItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              clearable
            />
          </div>
          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="form.ahi_baseline"
              type="number"
              :label="t('app.patients.form.ahiBaseline')"
              :rules="ahiBaselineRules"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
            <VTextField
              v-model="form.cpap_device"
              :label="t('app.patients.form.cpapDevice')"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
          </div>
          <VTextField
            v-model="form.medical_record"
            :label="t('app.patients.form.medicalRecord')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
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
      content-class="pwa-form-dialog__content"
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
import { useI18n } from "vue-i18n";
import { useConfigStore } from "../stores/config";
import { usePatientForm } from "../composables/usePatientForm";

export interface PatientFormData {
  salutation: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  practitioner_id: string;
  status: string;
  region: string;
  ahi_baseline: string;
  cpap_device: string;
  medical_record: string;
}

export interface PatientFormInitialData {
  id?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  status?: string;
  region?: string;
  ahi_baseline?: number | null;
  cpap_device?: string;
  medical_record?: string;
}

export interface PatientSubmitPayload {
  id?: string;
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  status?: string;
  region?: string;
  ahi_baseline?: number;
  cpap_device?: string;
  medical_record?: string;
}

const props = withDefaults(
  defineProps<{ modelValue: boolean; initialData?: PatientFormInitialData }>(),
  { modelValue: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: PatientSubmitPayload];
}>();

const { t } = useI18n();
const configStore = useConfigStore();

const {
  formRef, form, submitting, showDiscardConfirm,
  practitionerOptions, loadingPractitioners,
  statusItems,
  formTitle, formSubmitLabel,
  firstNameRules, lastNameRules, emailRules, phoneRules, ahiBaselineRules,
  onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
} = usePatientForm(props, emit as (event: string, ...args: unknown[]) => void);
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->

