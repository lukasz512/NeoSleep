<template>
  <div class="change-password-view">
    <VCard class="change-password-view__card" elevation="4" rounded="lg">
      <VCardText class="change-password-view__body">
        <h1 class="change-password-view__title">{{ t('user.changePassword.title') }}</h1>
        <p class="change-password-view__subtitle">{{ t('user.changePassword.subtitle') }}</p>

        <VAlert
          v-if="errorKey"
          type="error"
          variant="tonal"
          density="compact"
          class="change-password-view__alert"
          closable
          @click:close="errorKey = null"
        >
          {{ t(errorKey) }}
        </VAlert>

        <VForm ref="form" class="change-password-view__form" @submit.prevent="handleSubmit">
          <VTextField
            v-model="currentPassword"
            :type="showCurrentPassword ? 'text' : 'password'"
            :label="t('user.changePassword.currentPassword')"
            variant="outlined"
            density="comfortable"
            autocomplete="current-password"
            :rules="[rulePasswordRequired]"
            class="change-password-view__field"
            :disabled="loading"
            :append-inner-icon="showCurrentPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showCurrentPassword = !showCurrentPassword"
          />

          <VTextField
            v-model="newPassword"
            :type="showNewPassword ? 'text' : 'password'"
            :label="t('user.changePassword.newPassword')"
            variant="outlined"
            density="comfortable"
            autocomplete="new-password"
            :rules="[rulePasswordRequired, ruleNewPasswordLength]"
            class="change-password-view__field"
            :disabled="loading"
            :append-inner-icon="showNewPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showNewPassword = !showNewPassword"
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
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { inject } from "vue";
import { createUseChangePasswordFlow } from "../composables/useChangePasswordFlow";
import type { ApiFetchOptions } from "@api";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

const { t } = useI18n();

const apiFetch = inject<ApiFetchFn>("neo:apiFetch")!;

const useChangePasswordFlow = createUseChangePasswordFlow(apiFetch);
const { currentPassword, newPassword, loading, errorKey, submit } = useChangePasswordFlow();

const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

const rulePasswordRequired = (v: string) =>
  !!v || t("user.changePassword.validation.passwordRequired");
const ruleNewPasswordLength = (v: string) =>
  v.length >= 8 || t("user.changePassword.validation.passwordTooShort");

async function handleSubmit() {
  if (!form.value) return;
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

.change-password-view__alert {
  margin-bottom: 20px;
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
