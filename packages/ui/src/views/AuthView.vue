<template>
  <div class="auth-view">
    <AuthChrome ref="authChromeRef" />

    <AuthCard
      ref="authCardRef"
      class="auth-view__card"
      :style="cardAccentStyle"
      :back-to="backTo"
      :title="cardTitle"
      :loading="isLoading"
      :step-key="stepKey"
    >
      <div v-if="step === 'signin'" class="auth-view__body">
        <h1 class="auth-view__title-visually-hidden">{{ t('user.login.title') }}</h1>

        <VAlert
          v-if="loginFlow.errorKey.value"
          type="error"
          variant="tonal"
          density="compact"
          class="auth-view__alert"
          closable
          @click:close="loginFlow.errorKey.value = null"
        >
          {{ t(loginFlow.errorKey.value) }}
        </VAlert>

        <VForm ref="signinForm" class="auth-view__form" @submit.prevent="handleSignIn">
          <VTextField
            ref="loginEmailFieldRef"
            v-model="loginFlow.email.value"
            type="email"
            :label="t('user.login.email')"
            variant="outlined"
            density="comfortable"
            autocomplete="email"
            :rules="[ruleEmailRequired, ruleEmailFormat]"
            class="auth-view__field"
            :disabled="loginFlow.loading.value"
          >
            <template #prepend-inner>
              <button
                type="button"
                class="auth-view__at-btn"
                :aria-label="t('app.identity.form.emailInsertAt')"
                @mousedown.prevent="insertAtSign(loginFlow.email, loginEmailFieldRef)"
              >
                <VIcon icon="mdi-at" size="20" />
              </button>
            </template>
          </VTextField>

          <VTextField
            v-model="loginFlow.password.value"
            :type="showPassword ? 'text' : 'password'"
            :label="t('user.login.password')"
            variant="outlined"
            density="comfortable"
            autocomplete="current-password"
            prepend-inner-icon="mdi-lock-outline"
            :rules="[rulePasswordRequired]"
            class="auth-view__field"
            :disabled="loginFlow.loading.value"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
          />

          <div class="auth-view__row">
            <VCheckbox
              v-model="loginFlow.rememberMe.value"
              :label="t('user.login.rememberMe')"
              density="compact"
              hide-details
              class="auth-view__remember"
            />
          </div>

          <VBtn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="loginFlow.loading.value"
            class="auth-view__submit"
          >
            {{ t('user.login.signIn') }}
          </VBtn>
        </VForm>

        <div class="auth-view__footer">
          <VBtn
            variant="text"
            size="small"
            to="/forgot-password"
            class="auth-view__forgot"
            @click="goToForgot"
          >
            {{ t('user.login.forgotPassword') }}
          </VBtn>
        </div>
      </div>

      <div v-else-if="step === 'forgot'" class="auth-view__body">
        <p class="auth-view__subtitle">{{ t('user.forgotPassword.subtitle') }}</p>

        <VForm ref="forgotForm" class="auth-view__form" @submit.prevent="handleForgotSubmit">
          <VTextField
            ref="forgotEmailFieldRef"
            v-model="forgotFlow.email.value"
            type="email"
            :label="t('user.login.email')"
            variant="outlined"
            density="comfortable"
            autocomplete="email"
            :rules="[ruleEmailRequired, ruleEmailFormat]"
            class="auth-view__field"
            :disabled="forgotFlow.loading.value"
          >
            <template #prepend-inner>
              <button
                type="button"
                class="auth-view__at-btn"
                :aria-label="t('app.identity.form.emailInsertAt')"
                @mousedown.prevent="insertAtSign(forgotFlow.email, forgotEmailFieldRef)"
              >
                <VIcon icon="mdi-at" size="20" />
              </button>
            </template>
          </VTextField>

          <VBtn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="forgotFlow.loading.value"
            class="auth-view__submit"
          >
            {{ t('user.forgotPassword.submit') }}
          </VBtn>
        </VForm>
      </div>

      <div v-else-if="step === 'sent'" class="auth-view__body">
        <template v-if="forgotFlow.submitted.value">
          <VAlert type="success" variant="tonal" density="comfortable" class="auth-view__result-alert">
            {{ t('user.forgotPassword.successMessage') }}
          </VAlert>
        </template>
        <template v-else>
          <VAlert type="error" variant="tonal" density="comfortable" class="auth-view__result-alert">
            {{ t(forgotFlow.errorKey.value ?? 'user.forgotPassword.error.network') }}
          </VAlert>
          <VBtn variant="text" size="small" class="auth-view__retry" @click="retryForgot">
            {{ t('user.forgotPassword.tryAgain') }}
          </VBtn>
        </template>
      </div>

      <div v-else class="auth-view__body">
        <template v-if="resetFlow.tokenValid.value === false">
          <p class="auth-view__subtitle auth-view__subtitle--break">{{ t('user.resetPassword.error.invalidToken') }}</p>
          <VBtn variant="outlined" color="primary" size="large" block to="/forgot-password" class="auth-view__submit">
            {{ t('user.resetPassword.requestNewLink') }}
          </VBtn>
        </template>

        <template v-else-if="resetFlow.tokenValid.value === true">
          <p class="auth-view__subtitle">{{ t('user.resetPassword.subtitle') }}</p>

          <VAlert
            v-if="resetFlow.errorKey.value"
            type="error"
            variant="tonal"
            density="compact"
            class="auth-view__alert"
            closable
            @click:close="resetFlow.errorKey.value = null"
          >
            {{ t(resetFlow.errorKey.value) }}
          </VAlert>

          <VForm ref="resetForm" class="auth-view__form" @submit.prevent="handleResetSubmit">
            <VTextField
              v-model="resetFlow.newPassword.value"
              :type="showResetPassword ? 'text' : 'password'"
              :label="t('user.resetPassword.newPassword')"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              prepend-inner-icon="mdi-lock-outline"
              :rules="[ruleResetPasswordRequired, ruleResetPasswordLength]"
              class="auth-view__field"
              :disabled="resetFlow.loading.value"
              :append-inner-icon="showResetPassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showResetPassword = !showResetPassword"
            />

            <VTextField
              v-model="resetFlow.confirmPassword.value"
              :type="showResetConfirmPassword ? 'text' : 'password'"
              :label="t('user.resetPassword.confirmPassword')"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              prepend-inner-icon="mdi-lock-outline"
              :rules="[ruleResetPasswordRequired, ruleResetPasswordsMatch]"
              class="auth-view__field"
              :disabled="resetFlow.loading.value"
              :append-inner-icon="showResetConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showResetConfirmPassword = !showResetConfirmPassword"
            />

            <VBtn
              type="submit"
              color="primary"
              size="large"
              block
              :loading="resetFlow.loading.value"
              class="auth-view__submit"
            >
              {{ t('user.resetPassword.submit') }}
            </VBtn>
          </VForm>
        </template>

        <div v-else class="auth-view__validating" aria-hidden="true" />
      </div>
    </AuthCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, nextTick } from "vue";
import type { Ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { brandColors } from "@brand/colors";
import { createUseLoginFlow } from "../composables/useLoginFlow";
import { createUseForgotPasswordFlow } from "../composables/useForgotPasswordFlow";
import { createUseResetPasswordFlow } from "../composables/useResetPasswordFlow";
import type { ApiFetchOptions } from "@api";
import AuthChrome from "../components/AuthChrome.vue";
import AuthCard from "../components/AuthCard.vue";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;
type Step = "signin" | "forgot" | "sent" | "reset";

function stepFromPath(path: string): Step {
  if (path === "/forgot-password") return "forgot";
  if (path === "/reset-password") return "reset";
  return "signin";
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const apiFetch = inject<ApiFetchFn>("neo:apiFetch")!;

const useLoginFlow = createUseLoginFlow(apiFetch);
const loginFlow = useLoginFlow();

const useForgotPasswordFlow = createUseForgotPasswordFlow(apiFetch);
const forgotFlow = useForgotPasswordFlow();

const useResetPasswordFlow = createUseResetPasswordFlow(apiFetch);
const resetFlow = useResetPasswordFlow();

// /login, /forgot-password and /reset-password share one route component
// (see routes.ts), so this instance — and the AuthChrome/AuthCard it
// renders once, above — persists across navigation between them instead of
// remounting. `step` just mirrors whichever URL we're on, restoring
// correctly on a direct load/bookmark/back-button too, not only on clicks.
const step = ref<Step>(stepFromPath(route.path));
watch(
  () => route.path,
  (path) => {
    if (path === "/forgot-password") step.value = "forgot";
    else if (path === "/reset-password") step.value = "reset";
    else if (path === "/login") step.value = "signin";
  },
);

// The reset step has its own validating → valid/invalid sub-states, each
// worth its own crossfade — step alone isn't granular enough for that.
const stepKey = computed(() => {
  if (step.value !== "reset") return step.value;
  if (resetFlow.tokenValid.value === null) return "reset-validating";
  return resetFlow.tokenValid.value ? "reset-valid" : "reset-invalid";
});

const backTo = computed(() => (step.value === "signin" ? null : "/login"));
// Signin's own <h1> is visually hidden (screen-reader only) — its title isn't meant to be seen, so
// AuthCard gets no title for that step; forgot/sent/reset all show one, rendered next to the back arrow.
const cardTitle = computed(() => {
  if (step.value === "forgot" || step.value === "sent") return t("user.forgotPassword.title");
  if (step.value === "reset") return t("user.resetPassword.title");
  return null;
});
const isLoading = computed(
  () => loginFlow.loading.value || forgotFlow.loading.value || resetFlow.loading.value,
);

const showPassword = ref(false);
const showResetPassword = ref(false);
const showResetConfirmPassword = ref(false);
const signinForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const forgotForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const resetForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const authCardRef = ref<{ playExit: () => Promise<void> } | null>(null);
const authChromeRef = ref<{ playExit: () => Promise<void> } | null>(null);
const loginEmailFieldRef = ref<{ $el?: HTMLElement } | null>(null);
const forgotEmailFieldRef = ref<{ $el?: HTMLElement } | null>(null);

/** Inserts "@" at the caret in an email field — a no-op once one is already present (an email has at most one). */
function insertAtSign(emailModel: Ref<string>, fieldRef: Ref<{ $el?: HTMLElement } | null>) {
  const current = emailModel.value ?? "";
  if (current.includes("@")) return;
  const inputEl = fieldRef.value?.$el?.querySelector("input") ?? undefined;
  const start = inputEl?.selectionStart ?? current.length;
  const end = inputEl?.selectionEnd ?? current.length;
  emailModel.value = current.slice(0, start) + "@" + current.slice(end);
  nextTick(() => {
    inputEl?.focus();
    // type="email" doesn't support the selection API — setSelectionRange
    // throws InvalidStateError there, so re-placing the caret is best-effort.
    try {
      inputEl?.setSelectionRange(start + 1, start + 1);
    } catch {
      // no-op: unsupported input type, focus() above is enough
    }
  });
}

const ruleEmailRequired = (v: string) =>
  !!v.trim() || t("user.login.validation.emailRequired");
const ruleEmailFormat = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || t("user.login.validation.emailInvalid");
const rulePasswordRequired = (v: string) =>
  !!v || t("user.login.validation.passwordRequired");
const ruleResetPasswordRequired = (v: string) =>
  !!v || t("user.resetPassword.validation.passwordRequired");
const ruleResetPasswordLength = (v: string) =>
  v.length >= 8 || t("user.resetPassword.validation.passwordTooShort");
const ruleResetPasswordsMatch = (v: string) =>
  v === resetFlow.newPassword.value || t("user.resetPassword.validation.passwordMismatch");

// Carries whatever's already typed in the sign-in form over to the
// forgot-password step, so the user isn't asked to retype their email.
function goToForgot() {
  forgotFlow.email.value = loginFlow.email.value.trim();
}

function retryForgot() {
  forgotFlow.errorKey.value = null;
  step.value = "forgot";
}

async function handleSignIn() {
  if (!signinForm.value) return;
  const { valid } = await signinForm.value.validate();
  if (!valid) return;
  // Retract in order — logo first, then the card collapses to its center —
  // so the app underneath only appears once the whole auth screen is gone.
  await loginFlow.submit({
    onSuccess: async () => {
      await authChromeRef.value?.playExit();
      await authCardRef.value?.playExit();
    },
  });
}

async function handleForgotSubmit() {
  if (!forgotForm.value) return;
  const { valid } = await forgotForm.value.validate();
  if (!valid) return;
  await forgotFlow.submit();
  step.value = "sent";
  if (forgotFlow.submitted.value) {
    window.setTimeout(() => router.push("/login"), 3000);
  }
}

async function handleResetSubmit() {
  if (!resetForm.value) return;
  const { valid } = await resetForm.value.validate();
  if (valid) await resetFlow.submit();
}

// /reset-password is only ever reached via a fresh page load (an emailed
// link), never by navigating here from signin/forgot within the app, so
// validating once on mount — rather than on every step change — is correct.
onMounted(() => {
  if (step.value === "reset") resetFlow.validateToken();
});

// Feeds the brand teal into the card border (see .auth-view__card in <style>), so the
// accent tracks packages/brand/colors.ts instead of a hardcoded hex duplicated here.
const cardAccentStyle = {
  "--auth-view-card-accent": brandColors.primary,
};
</script>

<style scoped>
.auth-view {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 24px 16px;
  /* Fixed offset, not vertical centering — the logo (AuthChrome) is the
     anchor; the card grows/shrinks below it without ever moving it. */
  padding-top: clamp(24px, 10vh, 96px);
  gap: 16px;
}

.auth-view__card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  /* No background here — VCard already themes its own surface color (light
     vs dark) via --v-theme-surface; a fixed white would fight that. */
  border: 1px solid color-mix(in srgb, var(--auth-view-card-accent) 28%, transparent);
}

.auth-view__body {
  padding: 24px 32px 32px;
}

/* Kept in the DOM for screen readers — functional, not visual focus. */
.auth-view__title-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.auth-view__subtitle {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 24px;
}

.auth-view__subtitle--break {
  white-space: pre-line;
}

.auth-view__alert {
  margin-bottom: 20px;
}

.auth-view__result-alert {
  margin-bottom: 4px;
}

.auth-view__form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-view__field {
  margin-bottom: 4px;
}

/* Clickable "@" prepend-inner icon on the email field — mirrors FormRenderer's insertAtSign(). */
.auth-view__at-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
}

.auth-view__row {
  display: flex;
  align-items: center;
  margin: 0 0 16px;
}

.auth-view__remember {
  flex: 1;
}

.auth-view__submit {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 600;
}

/* Block (full-width) buttons — the app-wide iOS-style hover/active scale
   (theme.scss .v-btn:hover/:active) looks like a broken zoom on a full-width
   element, so it's switched off just for these. */
.auth-view__submit:hover,
.auth-view__submit:active {
  transform: none !important;
}

.auth-view__footer {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

/* Flat text buttons (not the block submit) — same reasoning: the app-wide
   hover/active scale reads as a stray zoom on a small flat button, so these
   stay plain and just take the standard text-button hover tint instead. */
.auth-view__forgot,
.auth-view__retry {
  text-transform: none;
  letter-spacing: normal;
}

.auth-view__forgot:hover,
.auth-view__forgot:active,
.auth-view__retry:hover,
.auth-view__retry:active {
  transform: none !important;
}

.auth-view__validating {
  height: 24px;
}
</style>
