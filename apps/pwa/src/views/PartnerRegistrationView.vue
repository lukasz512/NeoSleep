<template>
  <div class="partner-registration">
    <AuthChrome />

    <AuthCard
      class="partner-registration__card"
      :style="cardAccentStyle"
      back-to="/login"
      :title="cardTitle"
      :loading="loading || submitting"
      :step-key="step"
    >
      <div v-if="step === 'loading'" class="partner-registration__loading">
        <AppLoadingState />
      </div>

      <div v-else-if="step === 'invalid'" class="partner-registration__body">
        <p class="partner-registration__subtitle">{{ t('user.partnerRegistration.invalidBody') }}</p>
      </div>

      <div v-else-if="step === 'submitted'" class="partner-registration__body">
        <VAlert type="success" variant="tonal" class="partner-registration__alert">
          {{ t('user.partnerRegistration.form.success') }}
        </VAlert>
        <AppButton color="primary" size="large" block to="/login" class="partner-registration__submit">
          {{ t('user.login.signIn') }}
        </AppButton>
      </div>

      <div v-else class="partner-registration__body">
        <p class="partner-registration__subtitle">{{ t('user.partnerRegistration.subtitle') }}</p>

        <VAlert
          v-if="errorKey"
          type="error"
          variant="tonal"
          density="compact"
          closable
          class="partner-registration__alert"
          @click:close="errorKey = null"
        >
          {{ t(errorKey) }}
        </VAlert>

        <VForm ref="formRef" @submit.prevent="onSubmit">
          <div class="partner-registration__grid">
            <VTextField
              v-model="password"
              type="password"
              :label="t('user.partnerRegistration.form.password')"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              :rules="[rulePasswordMin]"
            />
            <VTextField
              v-model="confirmPassword"
              type="password"
              :label="t('user.partnerRegistration.form.confirmPassword')"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              :rules="[rulePasswordMatch]"
            />
            <VTextField
              v-model="clinicName"
              :label="t('user.partnerRegistration.form.clinicName')"
              variant="outlined"
              density="comfortable"
              :rules="[ruleClinicNameRequired]"
            />
            <VTextField
              v-model="taxId"
              :label="t('user.partnerRegistration.form.taxId')"
              variant="outlined"
              density="comfortable"
              :rules="[ruleTaxIdRequired]"
            />
            <VTextField
              v-model="billingAddress"
              :label="t('user.partnerRegistration.form.billingAddress')"
              variant="outlined"
              density="comfortable"
              class="partner-registration__full"
              :rules="[ruleBillingAddressRequired]"
            />
          </div>

          <VCheckbox v-model="gdprAccepted" density="compact" :rules="[ruleGdprRequired]">
            <template #label>
              <span>
                {{ t('user.partnerRegistration.form.gdprLabel') }} —
                <a href="#" @click.prevent="showGdprDialog = true">{{ t('user.partnerRegistration.form.viewDocument') }}</a>
              </span>
            </template>
          </VCheckbox>
          <VCheckbox v-model="agreementAccepted" density="compact" :rules="[ruleAgreementRequired]">
            <template #label>
              <span>
                {{ t('user.partnerRegistration.form.agreementLabel') }} —
                <a href="#" @click.prevent="showAgreementDialog = true">{{ t('user.partnerRegistration.form.viewDocument') }}</a>
              </span>
            </template>
          </VCheckbox>

          <p class="partner-registration__signature-label">{{ t('user.partnerRegistration.form.signatureLabel') }}</p>
          <SignaturePad ref="signaturePadRef" :clear-label="t('user.partnerRegistration.form.signatureClear')" />
          <p v-if="signatureError" class="partner-registration__signature-error">
            {{ t('user.partnerRegistration.form.signatureRequired') }}
          </p>

          <AppButton
            type="submit"
            color="primary"
            size="large"
            block
            :loading="submitting"
            class="partner-registration__submit"
          >
            {{ t('user.partnerRegistration.form.submit') }}
          </AppButton>
        </VForm>
      </div>
    </AuthCard>

    <VDialog v-model="showGdprDialog" max-width="560" :transition="originDialogTransition">
      <VCard>
        <VCardTitle>{{ t('documents.gdprConsent.title') }}</VCardTitle>
        <VCardText class="partner-registration__document-text">{{ t('documents.gdprConsent.body') }}</VCardText>
        <VCardActions><VSpacer /><AppButton variant="text" @click="showGdprDialog = false">{{ t('app.common.close') }}</AppButton></VCardActions>
      </VCard>
    </VDialog>
    <VDialog v-model="showAgreementDialog" max-width="560" :transition="originDialogTransition">
      <VCard>
        <VCardTitle>{{ t('documents.partnerAgreement.title') }}</VCardTitle>
        <VCardText class="partner-registration__document-text">{{ t('documents.partnerAgreement.body') }}</VCardText>
        <VCardActions><VSpacer /><AppButton variant="text" @click="showAgreementDialog = false">{{ t('app.common.close') }}</AppButton></VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { AuthChrome, AuthCard, originDialogTransition } from "@ui";
import { brandColors } from "@brand/colors";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppButton from "../components/AppButton.vue";
import SignaturePad from "../components/SignaturePad.vue";
import { apiFetch } from "../composables/useBffApi";

/**
 * Public registration page reached via the doctor-invite email link
 * (?token=...). Deliberately the SAME shell as /login (AuthChrome + AuthCard
 * from @ui — logo, theme/locale switcher, animated card) so it reads as part
 * of the same product, just wider and with different content — not the
 * narrower FormRenderer dialog (built for an already-authenticated in-app
 * entity-edit context) or a bespoke one-off page.
 */

const { t } = useI18n();
const route = useRoute();

type Step = "loading" | "invalid" | "form" | "submitted";

interface InvitePreview {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const step = ref<Step>("loading");
const submitting = ref(false);
const errorKey = ref<string | null>(null);
const signatureError = ref(false);

const password = ref("");
const confirmPassword = ref("");
const clinicName = ref("");
const taxId = ref("");
const billingAddress = ref("");
const gdprAccepted = ref(false);
const agreementAccepted = ref(false);
const showGdprDialog = ref(false);
const showAgreementDialog = ref(false);

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const signaturePadRef = ref<InstanceType<typeof SignaturePad> | null>(null);

// Same computed pattern as AuthView.vue — true while the initial token
// validation is in flight (there is no "loading" prop separate from the
// step machine here, unlike AuthView, since this page has no other async
// step transitions besides validate-on-mount and submit).
const loading = computed(() => step.value === "loading");

const cardTitle = computed(() =>
  step.value === "invalid" ? t("user.partnerRegistration.invalidTitle") : t("user.partnerRegistration.title")
);

// Same technique as AuthView.vue's cardAccentStyle — feeds brand teal into
// the card border via a CSS custom property instead of a hardcoded hex.
const cardAccentStyle = { "--partner-registration-card-accent": brandColors.primary };

function rulePasswordMin(v: string) {
  return v.length >= 8 || t("user.partnerRegistration.form.validation.passwordMin");
}
function rulePasswordMatch(v: string) {
  return v === password.value || t("user.partnerRegistration.form.validation.passwordMismatch");
}
function ruleClinicNameRequired(v: string) {
  return !!v.trim() || t("user.partnerRegistration.form.validation.clinicNameRequired");
}
function ruleTaxIdRequired(v: string) {
  return !!v.trim() || t("user.partnerRegistration.form.validation.taxIdRequired");
}
function ruleBillingAddressRequired(v: string) {
  return !!v.trim() || t("user.partnerRegistration.form.validation.billingAddressRequired");
}
function ruleGdprRequired(v: boolean) {
  return v === true || t("user.partnerRegistration.form.validation.gdprRequired");
}
function ruleAgreementRequired(v: boolean) {
  return v === true || t("user.partnerRegistration.form.validation.agreementRequired");
}

onMounted(async () => {
  const token = typeof route.query.token === "string" ? route.query.token : "";
  if (!token) { step.value = "invalid"; return; }
  try {
    const res = await apiFetch(`/api/v1/invite/validate?token=${encodeURIComponent(token)}`, { handleErrors: false });
    step.value = res.ok ? "form" : "invalid";
  } catch {
    step.value = "invalid";
  }
});

async function onSubmit() {
  const form = await formRef.value?.validate();
  signatureError.value = signaturePadRef.value?.isEmpty() ?? true;
  if (!form?.valid || signatureError.value) return;

  const signatureDataUrl = signaturePadRef.value?.toDataURL();
  const token = typeof route.query.token === "string" ? route.query.token : "";

  submitting.value = true;
  errorKey.value = null;
  try {
    const res = await apiFetch("/api/v1/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      handleErrors: false,
      body: JSON.stringify({
        token,
        password: password.value,
        clinicName: clinicName.value,
        taxId: taxId.value,
        billingAddress: billingAddress.value,
        gdprAccepted: gdprAccepted.value,
        agreementAccepted: agreementAccepted.value,
        signatureDataUrl,
      }),
    });
    if (res.ok) {
      step.value = "submitted";
    } else {
      errorKey.value = "user.partnerRegistration.form.errorSubmit";
    }
  } catch {
    errorKey.value = "user.partnerRegistration.form.errorSubmit";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
/* Same wrapper pattern as AuthView.vue's .auth-view, except overflow-y: auto
   (this form is taller than the viewport on small screens — login's never
   is, so AuthView doesn't need this) and a wider card. */
.partner-registration {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow-y: auto;
  padding: 24px 16px 40px;
  padding-top: clamp(24px, 10vh, 96px);
  gap: 16px;
}

.partner-registration__card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 680px;
  border: 1px solid color-mix(in srgb, var(--partner-registration-card-accent) 28%, transparent);
}

.partner-registration__loading {
  padding: 8px 32px 32px;
}

.partner-registration__body {
  padding: 8px 32px 32px;
}

.partner-registration__subtitle {
  margin: 0 0 24px;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.partner-registration__alert {
  margin-bottom: 20px;
}

.partner-registration__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.partner-registration__full {
  grid-column: 1 / -1;
}

@media (max-width: 560px) {
  .partner-registration__grid {
    grid-template-columns: 1fr;
  }
}

.partner-registration__signature-label {
  margin: 16px 0 8px;
  font-size: 0.875rem;
  font-weight: 500;
}

.partner-registration__signature-error {
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-error));
}

.partner-registration__submit {
  margin-top: 24px;
  text-transform: none;
  letter-spacing: normal;
}

.partner-registration__document-text {
  white-space: pre-line;
}
</style>
