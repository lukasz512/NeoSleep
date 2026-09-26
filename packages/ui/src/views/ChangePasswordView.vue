<template>
  <div ref="formEl" class="change-password-view">
    <VCard class="change-password-view__card" elevation="2" rounded="lg">
      <VCardText class="change-password-view__body">
        <h1 class="change-password-view__title">{{ t('user.changePassword.title') }}</h1>
        <p class="change-password-view__subtitle">{{ t('user.changePassword.subtitle') }}</p>

        <VForm ref="form" class="change-password-view__form" @submit.prevent="handleSubmit">
          <FormErrorSummary :errors="summary.lines.value" :title="summary.title.value" @select="focusField" />

          <VTextField
            v-model="currentPassword"
            data-field="current_password"
            :type="showCurrentPassword ? 'text' : 'password'"
            :label="t('user.changePassword.currentPassword')"
            variant="outlined"
            density="comfortable"
            autocomplete="current-password"
            prepend-inner-icon="mdi-lock-outline"
            :rules="[rulePasswordRequired]"
            :error-messages="summary.serverError('current_password')"
            class="change-password-view__field"
            :disabled="loading"
            :append-inner-icon="showCurrentPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showCurrentPassword = !showCurrentPassword"
            @update:model-value="summary.clearServerError('current_password')"
          />

          <VTextField
            v-model="newPassword"
            data-field="new_password"
            :type="showNewPassword ? 'text' : 'password'"
            :label="t('user.changePassword.newPassword')"
            variant="outlined"
            density="comfortable"
            autocomplete="new-password"
            prepend-inner-icon="mdi-lock-outline"
            :rules="[rulePasswordRequired, ruleNewPasswordLength]"
            :error-messages="summary.serverError('new_password')"
            class="change-password-view__field"
            :disabled="loading"
            :append-inner-icon="showNewPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showNewPassword = !showNewPassword"
            @update:model-value="summary.clearServerError('new_password')"
          />

          <VBtn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="loading"
            class="change-password-view__submit"
          >
            {{ t('user.changePassword.submit') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, inject } from "vue";
import { useI18n } from "vue-i18n";
import { createUseChangePasswordFlow } from "../composables/useChangePasswordFlow";
import { focusFormField, useFormErrorSummary } from "../composables/useFormErrorSummary";
import type { ApiFetchOptions } from "@api";
import FormErrorSummary from "../components/FormErrorSummary.vue";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;
type NotifyFn = (message: string, type: "success" | "info" | "warning" | "error", key?: string) => void;

const { t } = useI18n();

const apiFetch = inject<ApiFetchFn>("neo:apiFetch")!;
const notify = inject<NotifyFn | null>("neo:notify", null);

const useChangePasswordFlow = createUseChangePasswordFlow(apiFetch);
const { currentPassword, newPassword, loading, errorKey, toastKey, fieldErrors, submit } = useChangePasswordFlow();

const INCORRECT_CURRENT_KEY = "user.changePassword.error.incorrectCurrent";

// Errors live in the form (NEO-109): under the field and in the summary box on
// top. Only what no field can fix (no connection, server error) is a toast.
const summary = useFormErrorSummary({
  fields: () => [
    {
      key: "current_password",
      label: t("user.changePassword.currentPassword"),
      value: currentPassword.value,
      rules: [rulePasswordRequired],
    },
    {
      key: "new_password",
      label: t("user.changePassword.newPassword"),
      value: newPassword.value,
      rules: [rulePasswordRequired, ruleNewPasswordLength],
    },
  ],
  // A wrong current password is marked on that field instead (see the watch below).
  formErrorKeys: () => [errorKey.value === INCORRECT_CURRENT_KEY ? null : errorKey.value],
  formTitleKey: "user.changePassword.errorSummary.title",
});

watch(errorKey, (key) => {
  if (key === INCORRECT_CURRENT_KEY) summary.setServerMessage("current_password", t(key));
});
watch(fieldErrors, (errors) => {
  if (errors && !summary.setServerErrors(errors)) errorKey.value = "user.changePassword.error.network";
});
watch(toastKey, (key) => {
  if (key) notify?.(t(key), "error", key);
});

const formEl = ref<HTMLElement | null>(null);
function focusField(key: string) {
  focusFormField(formEl.value?.querySelector(`[data-field="${key}"]`));
}

const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

function rulePasswordRequired(v: string): true | string {
  return !!v || t("user.changePassword.validation.passwordRequired");
}
function ruleNewPasswordLength(v: string): true | string {
  return v.length >= 8 || t("user.changePassword.validation.passwordTooShort");
}

async function handleSubmit() {
  if (!form.value) return;
  summary.attempted.value = true;
  const { valid } = await form.value.validate();
  if (valid) await submit();
}
</script>

<style scoped>
.change-password-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px 16px;
  gap: 16px;
}

.change-password-view__card {
  width: 100%;
  max-width: 420px;
}

.change-password-view__body {
  padding: 32px;
}

.change-password-view__title {
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.25px;
  margin: 0 0 4px;
  line-height: 1.3;
}

.change-password-view__subtitle {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 24px;
}

.change-password-view__form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.change-password-view__field {
  margin-bottom: 4px;
}

.change-password-view__submit {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 600;
  margin-top: 12px;
}
</style>
