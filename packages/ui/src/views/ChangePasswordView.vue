<template>
  <div class="change-password-view">
    <VCard class="change-password-view__card" elevation="2" rounded="lg">
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
            prepend-inner-icon="mdi-lock-outline"
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
            prepend-inner-icon="mdi-lock-outline"
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
          <!-- Opened from the account menu (NEO-102) the change is optional, so
               it can be abandoned; after a forced change on login it can't. -->
          <VBtn
            v-if="voluntary"
            variant="text"
            size="large"
            block
            :disabled="loading"
            class="change-password-view__cancel"
            data-testid="change-password-cancel"
            @click="cancel"
          >
            {{ t('user.changePassword.cancel') }}
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
import { useRoute, useRouter } from "vue-router";
import { createUseChangePasswordFlow, CHANGE_PASSWORD_FROM_MENU } from "../composables/useChangePasswordFlow";
import type { ApiFetchOptions } from "@api";
import type { AuthTokenStorage } from "@stores";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const apiFetch = inject<ApiFetchFn>("neo:apiFetch")!;
const authTokenStorage = inject<AuthTokenStorage>("neo:authTokenStorage")!;

/** Reached from the account menu rather than forced on login. */
const voluntary = route.query.from === CHANGE_PASSWORD_FROM_MENU;

/** Back to wherever the menu was opened; the app's start page if the URL was opened directly. */
function cancel() {
  if (typeof window.history.state?.back === "string") router.back();
  else void router.push("/");
}

const useChangePasswordFlow = createUseChangePasswordFlow(apiFetch, authTokenStorage);
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

.change-password-view__cancel {
  text-transform: none;
  letter-spacing: normal;
}
</style>
