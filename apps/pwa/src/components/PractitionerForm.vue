<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="pwa-form-dialog__content"
    class="practitioner-form-dialog"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="pwa-form-dialog__card">
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
          {{ t('user.leads.form.verifyDataInfo') }}
        </VAlert>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VTextField
            v-model="form.salutation"
            :label="t('user.hcp.form.salutation')"
            :placeholder="t('user.hcp.form.salutationPlaceholder')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="honorific-prefix"
          />
          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="form.first_name"
              :label="t('user.hcp.form.firstName')"
              :rules="firstNameRules"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="given-name"
            />
            <VTextField
              v-model="form.last_name"
              :label="t('user.hcp.form.lastName')"
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
            :label="t('user.leads.form.email')"
            :rules="emailRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="email"
          />
          <VTextField
            :model-value="form.phone"
            :label="t('user.hcp.form.phone')"
            :placeholder="t('user.hcp.form.phonePlaceholder')"
            :rules="phoneRules"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="tel"
            @update:model-value="form.phone = ($event ?? '').replace(/\D/g, '')"
          >
            <template #prepend-inner>
              <span class="practitioner-form__phone-prefix">+52</span>
            </template>
          </VTextField>
          <div class="pwa-form-row mb-3">
            <VSelect
              v-model="form.primary_specialty"
              :label="t('user.hcp.form.specialty')"
              :items="configStore.specialtyItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              clearable
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
          <div class="pwa-form-row mb-3">
            <VSelect
              v-model="form.influence_tier"
              :label="t('user.hcp.form.influenceTier')"
              :items="influenceTierItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
            <VTextField
              v-model="form.language"
              :label="t('user.hcp.form.language')"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              autocomplete="language"
            />
          </div>
          <VTextField
            v-model="form.national_id"
            :label="t('user.hcp.form.nationalId')"
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
import { usePractitionerForm } from "../composables/usePractitionerForm";

export interface PractitionerFormData {
  salutation: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  primary_specialty: string;
  institution: string;
  region: string;
  influence_tier: string;
  language: string;
  national_id: string;
}

export interface PractitionerFormInitialData {
  id?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  primary_specialty?: string;
  specialty?: string;
  institution?: string;
  region?: string;
  influence_tier?: string;
  language?: string;
  national_ids?: Record<string, string> | null;
}

export interface PractitionerSubmitPayload {
  id?: string;
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  primary_specialty?: string;
  institution?: string;
  region?: string;
  influence_tier?: string;
  language?: string;
  national_ids?: Record<string, string> | null;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    initialData?: PractitionerFormInitialData;
    /** Show info banner asking to verify data (e.g. when converting a lead to a contact). */
    showVerifyInfo?: boolean;
  }>(),
  { modelValue: false, showVerifyInfo: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: PractitionerSubmitPayload];
}>();

const { t } = useI18n();
const configStore = useConfigStore();

const {
  formRef, form, submitting, showDiscardConfirm,
  influenceTierItems,
  formTitle, formSubmitLabel,
  firstNameRules, lastNameRules, emailRules, phoneRules,
  onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
} = usePractitionerForm(props, emit as (event: string, ...args: unknown[]) => void);
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->
<style scoped>
.practitioner-form__phone-prefix {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-inline-end: 4px;
}
</style>
