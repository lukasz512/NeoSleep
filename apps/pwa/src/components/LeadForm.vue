<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="pwa-form-dialog__content"
    class="lead-form-dialog"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="pwa-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6">
        {{ formTitle }}
      </VCardTitle>
      <VCardText>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VCombobox
            v-model="form.salutation"
            :label="t('user.leads.form.salutation')"
            :items="salutationItems"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            clearable
          />
          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="form.first_name"
              :label="t('user.leads.form.firstName')"
              :rules="firstNameRules"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="given-name"
            />
            <VTextField
              v-model="form.last_name"
              :label="t('user.leads.form.lastName')"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="family-name"
            />
          </div>
          <VTextField
            v-model="form.email"
            type="email"
            :label="t('user.leads.form.email')"
            :rules="emailRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="email"
          />
          <VTextField
            :model-value="form.phone"
            :label="t('user.leads.form.phone')"
            :rules="phoneRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="tel"
            @update:model-value="form.phone = ($event ?? '').replace(/\D/g, '')"
          />
          <div class="pwa-form-row mb-3">
            <VSelect
              v-model="form.status"
              :label="t('user.leads.form.status')"
              :items="statusItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
            <VSelect
              v-model="form.region"
              :label="t('user.leads.form.region')"
              :items="configStore.regionItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              clearable
            />
          </div>
          <VTextField
            v-model="form.institution"
            :label="t('user.leads.form.institution')"
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
import { useLeadForm } from "../composables/useLeadForm";

export interface LeadFormData {
  salutation: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  region: string;
  institution: string;
}

export interface LeadFormInitialData {
  id?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: string;
  region?: string;
  institution?: string;
}

export interface LeadSubmitPayload {
  id?: string;
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  status: string;
  region?: string;
  institution?: string;
}

const props = withDefaults(
  defineProps<{ modelValue: boolean; initialData?: LeadFormInitialData }>(),
  { modelValue: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: LeadSubmitPayload];
}>();

const { t } = useI18n();
const configStore = useConfigStore();

const {
  formRef, form, submitting, showDiscardConfirm,
  statusItems, salutationItems,
  formTitle, formSubmitLabel,
  firstNameRules, emailRules, phoneRules,
  onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
} = useLeadForm(props, emit as (event: string, ...args: unknown[]) => void);
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->

