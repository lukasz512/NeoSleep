<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="pwa-form-dialog__content"
    class="organization-form-dialog"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="pwa-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6">
        {{ formTitle }}
      </VCardTitle>
      <VCardText>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VTextField
            v-model="form.name"
            :label="t('user.hco.form.name')"
            :rules="nameRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="organization"
          />
          <div class="pwa-form-row mb-3">
            <VSelect
              v-model="form.type"
              :label="t('user.hco.form.type')"
              :items="configStore.institutionTypeItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
            <VSelect
              v-model="form.status"
              :label="t('user.hco.form.status')"
              :items="statusItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
          </div>
          <VSelect
            v-model="form.region"
            :label="t('user.hco.form.region')"
            :items="configStore.regionItems"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            clearable
          />
          <VTextField
            v-model="form.address_line1"
            :label="t('user.hco.form.addressLine1')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="address-line1"
          />
          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="form.city"
              :label="t('user.hco.form.city')"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="address-level2"
            />
            <VTextField
              v-model="form.state"
              :label="t('user.hco.form.state')"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="address-level1"
            />
          </div>
          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="form.postal_code"
              :label="t('user.hco.form.postalCode')"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="postal-code"
            />
            <VTextField
              v-model="form.country_code"
              :label="t('user.hco.form.countryCode')"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="country"
            />
          </div>
          <VTextField
            :model-value="form.phone"
            :label="t('user.hco.form.phone')"
            :rules="phoneRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="tel"
            @update:model-value="form.phone = ($event ?? '').replace(/\D/g, '')"
          />
          <VTextField
            v-model="form.email"
            type="email"
            :label="t('user.hco.form.email')"
            :rules="emailRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="email"
          />
          <VTextField
            v-model="form.website"
            :label="t('user.hco.form.website')"
            :rules="websiteRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="url"
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
import { useOrganizationForm } from "../composables/useOrganizationForm";

export interface OrganizationFormData {
  name: string;
  type: string;
  status: string;
  region: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  phone: string;
  email: string;
  website: string;
}

export interface OrganizationFormInitialData {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
  region?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface OrganizationSubmitPayload {
  id?: string;
  name: string;
  type?: string;
  status?: string;
  region?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  website?: string;
}

const props = withDefaults(
  defineProps<{ modelValue: boolean; initialData?: OrganizationFormInitialData }>(),
  { modelValue: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: OrganizationSubmitPayload];
}>();

const { t } = useI18n();
const configStore = useConfigStore();

const {
  formRef, form, submitting, showDiscardConfirm,
  statusItems,
  formTitle, formSubmitLabel,
  nameRules, emailRules, websiteRules, phoneRules,
  onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
} = useOrganizationForm(props, emit as (event: string, ...args: unknown[]) => void);
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->

