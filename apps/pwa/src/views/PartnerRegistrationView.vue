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
          </div>

          <div class="partner-registration__clinic-details">
            <div class="partner-registration__clinic-details-header">
              <h2 class="partner-registration__clinic-details-heading">
                {{ t('user.partnerRegistration.form.clinicDetailsHeading') }}
              </h2>
              <AppButton variant="text" size="small" type="button" @click="openEditDialog">
                {{ t('user.partnerRegistration.form.editDetails') }}
              </AppButton>
            </div>
            <p class="partner-registration__clinic-details-hint">
              {{ t('user.partnerRegistration.form.clinicDetailsHint') }}
            </p>
            <dl class="partner-registration__clinic-details-list">
              <div v-for="field in clinicDetailFields" :key="field.key" class="partner-registration__clinic-details-row">
                <dt>{{ t(field.labelKey) }}</dt>
                <dd :class="{ 'partner-registration__clinic-details-empty': !field.value }">
                  {{ field.value || t('user.partnerRegistration.form.notProvided') }}
                </dd>
              </div>
            </dl>
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

    <VDialog v-model="showEditDialog" max-width="520" :transition="originDialogTransition">
      <VCard>
        <VCardTitle>{{ t('user.partnerRegistration.form.editModal.title') }}</VCardTitle>
        <VCardText>
          <VForm ref="editFormRef">
            <VTextField
              v-model="draftClinicName"
              :label="t('user.partnerRegistration.form.clinicName')"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              :rules="[ruleClinicNameRequired]"
            />
            <VTextField
              v-model="draftClinicEmail"
              :label="t('user.partnerRegistration.form.clinicEmail')"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              :rules="[ruleClinicEmailRequired]"
            />
            <VTextField
              v-model="draftClinicPhone"
              :label="t('user.partnerRegistration.form.clinicPhone')"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              :rules="[ruleClinicPhoneRequired]"
            />
            <VTextField
              v-model="draftTaxId"
              :label="t('user.partnerRegistration.form.taxId')"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              :rules="[ruleTaxIdRequired]"
            />
            <VTextField
              v-model="draftBillingAddress"
              :label="t('user.partnerRegistration.form.billingAddress')"
              variant="outlined"
              density="comfortable"
              :rules="[ruleBillingAddressRequired]"
            />
          </VForm>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="cancelEditDialog">{{ t('user.partnerRegistration.form.editModal.cancel') }}</AppButton>
          <AppButton color="primary" @click="saveEditDialog">{{ t('user.partnerRegistration.form.editModal.save') }}</AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
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
import { apiFetch } from "../composables/useApi";

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
  clinicName: string | null;
  clinicEmail: string | null;
  clinicPhone: string | null;
  clinicAddress: string | null;
  taxId: string | null;
}

const step = ref<Step>("loading");
const submitting = ref(false);
const errorKey = ref<string | null>(null);
const signatureError = ref(false);

const password = ref("");
const confirmPassword = ref("");

// Pre-filled from the invite's linked organization record when one exists (often partial —
// see docs/stories/partner-registration-legal-documents.md, 2026-09-16 addendum, on why tax ID
// in particular is almost never captured upstream today). Shown read-only in the template;
// only ever written to via saveEditDialog(), never bound directly to an input, so a doctor
// can't change one by accident while just reading the page.
const clinicName = ref("");
const clinicEmail = ref("");
const clinicPhone = ref("");
const taxId = ref("");
const billingAddress = ref("");

const gdprAccepted = ref(false);
const agreementAccepted = ref(false);
const showGdprDialog = ref(false);
const showAgreementDialog = ref(false);

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const signaturePadRef = ref<InstanceType<typeof SignaturePad> | null>(null);

interface ClinicDetailField {
  key: string;
  labelKey: string;
  value: string;
}

const clinicDetailFields = computed<ClinicDetailField[]>(() => [
  { key: "clinicName", labelKey: "user.partnerRegistration.form.clinicName", value: clinicName.value },
  { key: "clinicEmail", labelKey: "user.partnerRegistration.form.clinicEmail", value: clinicEmail.value },
  { key: "clinicPhone", labelKey: "user.partnerRegistration.form.clinicPhone", value: clinicPhone.value },
  { key: "taxId", labelKey: "user.partnerRegistration.form.taxId", value: taxId.value },
  { key: "billingAddress", labelKey: "user.partnerRegistration.form.billingAddress", value: billingAddress.value },
]);

const clinicDetailsComplete = computed(() =>
  clinicDetailFields.value.every((field) => field.value.trim().length > 0)
);

// Single "Edit details" button -> one modal for the whole group (Łukasz, 2026-09-16) rather
// than per-field inputs or per-field edit icons, specifically so a doctor can't change a field
// just by tapping into it while reading — edits only land in clinicName/etc. (above) on explicit
// Save; Cancel discards the drafts below untouched.
const showEditDialog = ref(false);
const editFormRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const draftClinicName = ref("");
const draftClinicEmail = ref("");
const draftClinicPhone = ref("");
const draftTaxId = ref("");
const draftBillingAddress = ref("");

function openEditDialog() {
  draftClinicName.value = clinicName.value;
  draftClinicEmail.value = clinicEmail.value;
  draftClinicPhone.value = clinicPhone.value;
  draftTaxId.value = taxId.value;
  draftBillingAddress.value = billingAddress.value;
  showEditDialog.value = true;
}

function cancelEditDialog() {
  showEditDialog.value = false;
}

async function saveEditDialog() {
  const result = await editFormRef.value?.validate();
  if (!result?.valid) return;
  clinicName.value = draftClinicName.value.trim();
  clinicEmail.value = draftClinicEmail.value.trim();
  clinicPhone.value = draftClinicPhone.value.trim();
  taxId.value = draftTaxId.value.trim();
  billingAddress.value = draftBillingAddress.value.trim();
  showEditDialog.value = false;
}

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
function ruleClinicEmailRequired(v: string) {
  return !!v.trim() || t("user.partnerRegistration.form.validation.clinicEmailRequired");
}
function ruleClinicPhoneRequired(v: string) {
  return !!v.trim() || t("user.partnerRegistration.form.validation.clinicPhoneRequired");
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
    if (res.ok) {
      const preview = (await res.json()) as InvitePreview;
      clinicName.value = preview.clinicName ?? "";
      clinicEmail.value = preview.clinicEmail ?? "";
      clinicPhone.value = preview.clinicPhone ?? "";
      taxId.value = preview.taxId ?? "";
      billingAddress.value = preview.clinicAddress ?? "";
      step.value = "form";
    } else {
      step.value = "invalid";
    }
  } catch {
    step.value = "invalid";
  }
});

async function onSubmit() {
  const form = await formRef.value?.validate();
  signatureError.value = signaturePadRef.value?.isEmpty() ?? true;
  if (!form?.valid || signatureError.value) return;
  if (!clinicDetailsComplete.value) {
    errorKey.value = "user.partnerRegistration.form.validation.clinicDetailsIncomplete";
    return;
  }

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
        clinicEmail: clinicEmail.value,
        clinicPhone: clinicPhone.value,
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

@media (max-width: 560px) {
  .partner-registration__grid {
    grid-template-columns: 1fr;
  }
}

.partner-registration__clinic-details {
  margin: 16px 0 8px;
  padding: 12px 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
}

.partner-registration__clinic-details-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.partner-registration__clinic-details-heading {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.partner-registration__clinic-details-hint {
  margin: 4px 0 12px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.partner-registration__clinic-details-list {
  display: grid;
  gap: 8px 16px;
}

.partner-registration__clinic-details-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.partner-registration__clinic-details-row dt {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.partner-registration__clinic-details-row dd {
  margin: 0;
  font-size: 0.9375rem;
}

.partner-registration__clinic-details-empty {
  color: rgb(var(--v-theme-error));
  font-style: italic;
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
