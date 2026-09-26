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

      <div v-else-if="step === 'unreachable'" class="partner-registration__body">
        <p class="partner-registration__subtitle" role="alert">{{ inviteFailureText?.body }} {{ inviteFailureText?.reference }}</p>
        <AppButton color="primary" size="large" block class="partner-registration__submit" @click="loadInvite">
          {{ t('app.errorState.refresh') }}
        </AppButton>
      </div>

      <div v-else-if="step === 'submitted'" class="partner-registration__body">
        <AppInlineAlert
          type="success"
          class="partner-registration__alert"
          :title="t('user.partnerRegistration.form.successTitle')"
          :text="t('user.partnerRegistration.form.success', { email: preview?.email ?? '' })"
        />
        <p class="partner-registration__subtitle" role="status" aria-live="polite">
          {{ t('user.partnerRegistration.form.redirecting', { seconds: redirectSeconds }) }}
        </p>
        <AppButton
          color="primary"
          size="large"
          block
          class="partner-registration__submit"
          @click="goToLogin"
        >
          {{ t('user.partnerRegistration.form.goToLogin') }}
        </AppButton>
      </div>

      <div v-else class="partner-registration__body">
        <p class="partner-registration__subtitle">{{ t('user.partnerRegistration.subtitle') }}</p>

        <AppInlineAlert
          v-if="errorKey"
          type="error"
          :close-label="t('app.common.close')"
          class="partner-registration__alert"
          @close="errorKey = null"
        >
          {{ t(errorKey) }}
        </AppInlineAlert>
        <AppInlineAlert
          v-if="infoKey"
          type="info"
          :close-label="t('app.common.close')"
          class="partner-registration__alert"
          @close="infoKey = null"
        >
          {{ t(infoKey) }}
        </AppInlineAlert>

        <VForm ref="formRef" @submit.prevent="onSubmit">
          <FormErrorSummary
            :errors="mainErrorList"
            :title="t('app.formRenderer.errorSummary.title', { n: mainErrorList.length })"
            @select="focusMainField"
          />
          <div class="partner-registration__grid">
            <VTextField
              :ref="(el: unknown) => setFieldEl('password', el)"
              v-model="password"
              type="password"
              :label="t('user.partnerRegistration.form.password')"
              variant="outlined"
              density="comfortable"
              autocomplete="new-password"
              :rules="[rulePasswordMin]"
              :error-messages="mainErrors.serverError('password')"
              @update:model-value="mainErrors.clearServerError('password')"
            />
            <VTextField
              :ref="(el: unknown) => setFieldEl('confirmPassword', el)"
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
              <!-- Tonal (light brand fill) + pencil icon, default size — Łukasz asked for an
                   icon and a background so the action can't be missed (NEO-51 review, 2026-09-25). -->
              <AppButton
                variant="tonal"
                color="primary"
                type="button"
                class="partner-registration__edit-button"
                @click="openEditDialog()"
              >
                <template #prepend><AppIcon name="pencil" /></template>
                {{ t('user.partnerRegistration.form.editDetails') }}
              </AppButton>
            </div>
            <p class="partner-registration__clinic-details-hint">
              {{ t('user.partnerRegistration.form.clinicDetailsHint') }}
            </p>
            <dl class="partner-registration__clinic-details-list">
              <div
                v-for="field in clinicDetailFields"
                :key="field.key"
                class="partner-registration__clinic-details-row"
                :data-field="field.key"
              >
                <dt>{{ t(field.labelKey) }}</dt>
                <dd :class="{ 'partner-registration__clinic-details-empty': !field.value && field.required }">
                  {{ field.value || t('user.partnerRegistration.form.notProvided') }}
                </dd>
                <!-- The API rejected this value (NEO-109): said here too, not only in the summary. -->
                <dd
                  v-if="mainErrors.serverError(field.key)"
                  class="partner-registration__clinic-details-error"
                  data-testid="clinic-detail-error"
                >
                  {{ mainErrors.serverError(field.key) }}
                </dd>
              </div>
            </dl>
          </div>

          <h2 class="partner-registration__documents-heading">{{ t('user.partnerRegistration.documents.heading') }}</h2>
          <div class="partner-registration__documents">
            <PartnerDocumentRow
              :title="t('user.partnerRegistration.documents.agreementTitle')"
              :subtitle="t('user.partnerRegistration.documents.agreementSubtitle')"
              :state="agreementState"
              :status="t(`user.partnerRegistration.documents.status.agreement.${agreementState}`)"
              :action-label="agreementSignature ? t('user.partnerRegistration.documents.viewAndResign') : t('user.partnerRegistration.documents.readAndSign')"
              :thumbnail="agreementSignature"
              @open="openDocument('agreement')"
            />
            <PartnerDocumentRow
              :title="t('user.partnerRegistration.documents.noticeTitle')"
              :subtitle="t('user.partnerRegistration.documents.noticeSubtitle')"
              :state="noticeState"
              :status="t(`user.partnerRegistration.documents.status.notice.${noticeState}`)"
              :action-label="noticeVersionId ? t('user.partnerRegistration.documents.view') : t('user.partnerRegistration.documents.read')"
              @open="openDocument('notice')"
            />
          </div>

          <AppButton
            type="submit"
            color="primary"
            size="large"
            block
            :disabled="!!finishHintKey"
            :loading="submitting"
            class="partner-registration__submit"
          >
            {{ t('user.partnerRegistration.form.finish') }}
          </AppButton>
          <p v-if="finishHintKey" class="partner-registration__finish-hint">{{ t(finishHintKey) }}</p>
        </VForm>
      </div>
    </AuthCard>

    <AppFormDialog
      v-model="showEditDialog"
      max-width="520"
      :title="t('user.partnerRegistration.form.editModal.title')"
      @close="cancelEditDialog"
>
      <VForm ref="editFormRef" @submit.prevent="saveEditDialog">
        <FormErrorSummary
          :errors="dialogErrorList"
          :title="t('app.formRenderer.errorSummary.title', { n: dialogErrorList.length })"
          @select="focusDialogField"
        />
        <VRadioGroup
          :ref="(el: unknown) => setFieldEl('practiceRole', el)"
          v-model="draftPracticeRole"
          :label="t('user.partnerRegistration.form.practiceRole')"
          :hint="t('user.partnerRegistration.form.practiceRoleHint')"
          persistent-hint
          class="mb-3"
          :error-messages="dialogErrors.serverError('practiceRole')"
          @update:model-value="dialogErrors.clearServerError('practiceRole')"
        >
          <VRadio :label="t('user.partnerRegistration.form.practiceRoleOwner')" value="owner" />
          <VRadio :label="t('user.partnerRegistration.form.practiceRoleStaff')" value="staff" />
        </VRadioGroup>
        <VTextField
          :ref="(el: unknown) => setFieldEl('licenseNumber', el)"
          v-model="draftLicenseNumber"
          :label="licenseLabel"
          :hint="licenseHint"
          persistent-hint
          variant="outlined"
          density="comfortable"
          class="mb-3"
          inputmode="numeric"
          :rules="[ruleLicenseNumber]"
          :error-messages="dialogErrors.serverError('licenseNumber')"
          @update:model-value="dialogErrors.clearServerError('licenseNumber')"
        />
        <VTextField
          :ref="(el: unknown) => setFieldEl('clinicName', el)"
          v-model="draftClinicName"
          :label="t('user.partnerRegistration.form.clinicName')"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :rules="[ruleClinicNameRequired]"
          :error-messages="dialogErrors.serverError('clinicName')"
          @update:model-value="dialogErrors.clearServerError('clinicName')"
        />
        <VTextField
          :ref="(el: unknown) => setFieldEl('clinicEmail', el)"
          v-model="draftClinicEmail"
          :label="t('user.partnerRegistration.form.clinicEmail')"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :rules="[ruleClinicEmailRequired]"
          :error-messages="dialogErrors.serverError('clinicEmail')"
          @update:model-value="dialogErrors.clearServerError('clinicEmail')"
        />
        <VTextField
          :ref="(el: unknown) => setFieldEl('clinicPhone', el)"
          v-model="draftClinicPhone"
          :label="t('user.partnerRegistration.form.clinicPhone')"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :rules="[ruleClinicPhoneRequired]"
          :error-messages="dialogErrors.serverError('clinicPhone')"
          @update:model-value="dialogErrors.clearServerError('clinicPhone')"
        />
        <VTextField
          :ref="(el: unknown) => setFieldEl('taxId', el)"
          v-model="draftTaxId"
          :label="draftPracticeRole === 'owner' ? t('user.partnerRegistration.form.taxId') : t('user.partnerRegistration.form.taxIdOptional')"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :rules="[ruleTaxId]"
          :error-messages="dialogErrors.serverError('taxId')"
          @update:model-value="dialogErrors.clearServerError('taxId')"
        />
        <VTextField
          :ref="(el: unknown) => setFieldEl('billingAddress', el)"
          v-model="draftBillingAddress"
          :label="t('user.partnerRegistration.form.billingAddress')"
          variant="outlined"
          density="comfortable"
          :rules="[ruleBillingAddressRequired]"
          :error-messages="dialogErrors.serverError('billingAddress')"
          @update:model-value="dialogErrors.clearServerError('billingAddress')"
        />
      </VForm>

      <template #actions>
        <VSpacer />
        <AppButton variant="text" @click="cancelEditDialog">{{ t('user.partnerRegistration.form.editModal.cancel') }}</AppButton>
        <AppButton color="primary" variant="flat" @click="saveEditDialog">{{ t('user.partnerRegistration.form.editModal.save') }}</AppButton>
      </template>
    </AppFormDialog>

    <PartnerDocumentDialog
      v-model="documentDialogOpen"
      :kind="openKind"
      :token="token"
      :title="openKind === 'agreement' ? t('user.partnerRegistration.documents.agreementTitle') : t('user.partnerRegistration.documents.noticeTitle')"
      :party="partyFields"
      :variant="practiceRole"
      :jurisdiction="jurisdiction"
      :signature="agreementSignature"
      :acknowledged="!!noticeVersionId"
      @signed="onAgreementSigned"
      @acknowledged="onNoticeAcknowledged"
    />
  </div>
</template>

<script setup lang="ts">
import { apiErrorFromResponse, reportCaught } from "@api";
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { VRadioGroup, VRadio } from "vuetify/components";
import { AuthChrome, AuthCard, FormErrorSummary, useErrorTextFor } from "@ui";
import { brandColors } from "@brand/colors";
import { isValidLicenseNumber, type LicenseCountry } from "@documents-browser";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import PartnerDocumentRow from "../components/partner/PartnerDocumentRow.vue";
import PartnerDocumentDialog from "../components/partner/PartnerDocumentDialog.vue";
import AppFormDialog from "../components/AppFormDialog.vue";
import { apiFetch } from "../composables/useApi";
import {
  useFormErrors,
  fieldErrorsFromResponse,
  focusFormField,
  type FieldErrors,
  type FormErrorField,
  type FormErrorSummaryLine,
} from "../composables/useFormErrors";
import { scrollToFormTop } from "../utils/scrollToFormTop";
import { AppInlineAlert } from "@ui";

/**
 * Public registration page reached via the doctor-invite email link
 * (?token=...). Deliberately the SAME shell as /login (AuthChrome + AuthCard
 * from @ui — logo, theme/locale switcher, animated card) so it reads as part
 * of the same product, just wider and with different content.
 *
 * NEO-51: the doctor sets a password, confirms their details (licence
 * number, owner vs staff, clinic data), then signs the partner agreement +
 * Annex 1 (DPA) — already countersigned by NeoSleep — and acknowledges the
 * privacy notice, each in PartnerDocumentDialog, which renders the real
 * document with the doctor's current details. Finish only unlocks once both
 * are done. See docs/stories/partner-onboarding-countersigned-documents.md.
 */

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

// After a successful registration the page says what happened (account
// active, documents emailed) and then moves on to login by itself, with the
// email pre-filled — the doctor has nothing left to do on this page.
const REDIRECT_SECONDS = 8;
const redirectSeconds = ref(REDIRECT_SECONDS);
let redirectTimer: ReturnType<typeof setInterval> | null = null;

function goToLogin() {
  if (redirectTimer) clearInterval(redirectTimer);
  redirectTimer = null;
  void router.push({ path: "/login", query: { email: preview.value?.email ?? "" } });
}

function startLoginRedirect() {
  redirectSeconds.value = REDIRECT_SECONDS;
  redirectTimer = setInterval(() => {
    redirectSeconds.value -= 1;
    if (redirectSeconds.value <= 0) goToLogin();
  }, 1000);
}

onBeforeUnmount(() => {
  if (redirectTimer) clearInterval(redirectTimer);
});

/** "unreachable": the invite could not be checked (network / server) — not the same as an invalid link (NEO-81). */
type Step = "loading" | "invalid" | "unreachable" | "form" | "submitted";
type PracticeRole = "owner" | "staff";

interface InvitePreview {
  email: string;
  firstName: string | null;
  lastName: string | null;
  clinicName: string | null;
  clinicEmail: string | null;
  clinicPhone: string | null;
  clinicAddress: string | null;
  taxId: string | null;
  jurisdiction: LicenseCountry | null;
  licenseNumber: string | null;
  practiceRole: PracticeRole;
  documents: { agreementVersionId: string; dpaVersionId: string; noticeVersionId: string } | null;
}

const token = typeof route.query.token === "string" ? route.query.token : "";

const step = ref<Step>("loading");
const submitting = ref(false);
const errorKey = ref<string | null>(null);
const infoKey = ref<string | null>(null);
const preview = ref<InvitePreview | null>(null);

const password = ref("");
const confirmPassword = ref("");

// Pre-filled from the invite (organization + practitioner records). Shown
// read-only in the template; only ever written to via saveEditDialog(), never
// bound directly to an input, so a doctor can't change one by accident while
// just reading the page.
const clinicName = ref("");
const clinicEmail = ref("");
const clinicPhone = ref("");
const taxId = ref("");
const billingAddress = ref("");
const licenseNumber = ref("");
const practiceRole = ref<PracticeRole>("staff");

// Signing state — the drawn signature for the agreement (+ Annex 1) and the
// version ids the doctor actually read; the notice's acknowledged version.
const agreementSignature = ref<string | null>(null);
const agreementVersionIds = ref<string[] | null>(null);
const noticeVersionId = ref<string | null>(null);

const formRef = ref<{ validate: () => Promise<{ valid: boolean }>; $el?: Element } | null>(null);

const jurisdiction = computed<LicenseCountry | null>(() => preview.value?.jurisdiction ?? null);
const licenseLabel = computed(() =>
  jurisdiction.value === "MX" ? t("app.identity.form.cedula") : t("app.identity.form.pwz")
);
const licenseHint = computed(() =>
  jurisdiction.value === "MX" ? t("app.identity.form.cedulaHint") : t("app.identity.form.pwzHint")
);

interface ClinicDetailField {
  key: string;
  labelKey: string;
  value: string;
  required: boolean;
}

const clinicDetailFields = computed<ClinicDetailField[]>(() => [
  {
    key: "licenseNumber",
    labelKey: jurisdiction.value === "MX" ? "app.identity.form.cedula" : "app.identity.form.pwz",
    value: licenseNumber.value,
    required: true,
  },
  {
    key: "practiceRole",
    labelKey: "user.partnerRegistration.form.practiceRole",
    value: t(practiceRole.value === "owner"
      ? "user.partnerRegistration.form.practiceRoleOwner"
      : "user.partnerRegistration.form.practiceRoleStaff"),
    required: true,
  },
  { key: "clinicName", labelKey: "user.partnerRegistration.form.clinicName", value: clinicName.value, required: true },
  { key: "clinicEmail", labelKey: "user.partnerRegistration.form.clinicEmail", value: clinicEmail.value, required: true },
  { key: "clinicPhone", labelKey: "user.partnerRegistration.form.clinicPhone", value: clinicPhone.value, required: true },
  {
    key: "taxId",
    labelKey: "user.partnerRegistration.form.taxId",
    value: taxId.value,
    required: practiceRole.value === "owner",
  },
  { key: "billingAddress", labelKey: "user.partnerRegistration.form.billingAddress", value: billingAddress.value, required: true },
]);

/**
 * Errors show in the form, never as a toast (NEO-109, see useFormErrors):
 * under the field, in a summary box on top of the form, only after the first
 * submit. The practice details are read-only on the page and edited in the
 * dialog, so a detail the API rejected is marked on its row, listed in the
 * page's summary (its link opens the dialog on that field) and shown under
 * that field in the dialog. A rejection about the whole form (stale
 * document, dead link) is a key-less summary line; only what the doctor
 * can't fix (network, 5xx) stays the red alert.
 */
const CLINIC_KEYS = ["licenseNumber", "practiceRole", "clinicName", "clinicEmail", "clinicPhone", "taxId", "billingAddress"] as const;
const PASSWORD_KEYS = ["password", "confirmPassword"] as const;
const mainErrors = useFormErrors();
const dialogErrors = useFormErrors();
/** i18n key of a form-level line in the page's summary (no field to jump to). */
const formLevelErrorKey = ref<string | null>(null);

const mainFieldErrors = mainErrors.errorListFor((): FormErrorField[] => [
  {
    key: "password",
    label: t("user.partnerRegistration.form.password"),
    value: password.value,
    rules: [(v) => rulePasswordMin(String(v ?? ""))],
  },
  {
    key: "confirmPassword",
    label: t("user.partnerRegistration.form.confirmPassword"),
    value: confirmPassword.value,
    rules: [(v) => rulePasswordMatch(String(v ?? ""))],
  },
  // No client rules here — an incomplete detail already keeps Finish disabled
  // (finishHintKey); these lines only carry what the API rejected.
  ...clinicDetailFields.value.map((f) => ({ key: f.key, label: t(f.labelKey), value: f.value })),
]);

const mainErrorList = computed<FormErrorSummaryLine[]>(() => [
  ...(formLevelErrorKey.value ? [{ message: t(formLevelErrorKey.value) }] : []),
  ...mainFieldErrors.value,
]);

// Field components by key, for the summary's jump links (page + dialog share the map — keys don't overlap).
const fieldEls: Record<string, unknown> = {};
function setFieldEl(key: string, el: unknown) {
  if (el) fieldEls[key] = el;
  else delete fieldEls[key];
}
function focusField(key: string) {
  focusFormField((fieldEls[key] as { $el?: Element } | undefined)?.$el);
}

function focusMainField(key: string) {
  if ((PASSWORD_KEYS as readonly string[]).includes(key)) focusField(key);
  else void openEditDialog(key);
}

const clinicDetailsComplete = computed(
  () =>
    clinicDetailFields.value.every((field) => !field.required || field.value.trim().length > 0) &&
    !!jurisdiction.value &&
    isValidLicenseNumber(jurisdiction.value, licenseNumber.value)
);

/** What the documents print about the doctor — also what the preview shows, so the preview never differs from the PDF. */
const partyFields = computed<Record<string, string>>(() => ({
  doctor_name: `${preview.value?.firstName ?? ""} ${preview.value?.lastName ?? ""}`.trim() || (preview.value?.email ?? ""),
  license_number: licenseNumber.value,
  clinic_name: clinicName.value,
  tax_id: taxId.value,
  clinic_address: billingAddress.value,
  email: preview.value?.email ?? "",
}));

// A signature covers the exact text the doctor saw. If they change a detail
// that's printed in the agreement after signing, drop the signature and ask
// again rather than submit a PDF that differs from what they signed.
watch([partyFields, practiceRole], () => {
  if (agreementSignature.value) {
    agreementSignature.value = null;
    agreementVersionIds.value = null;
    infoKey.value = "user.partnerRegistration.form.detailsChangedResign";
  }
});

const finishHintKey = computed<string | null>(() => {
  if (!clinicDetailsComplete.value) return "user.partnerRegistration.form.finishHintDetails";
  if (!agreementSignature.value && !noticeVersionId.value) return "user.partnerRegistration.form.finishHintBoth";
  if (!agreementSignature.value) return "user.partnerRegistration.form.finishHintAgreement";
  if (!noticeVersionId.value) return "user.partnerRegistration.form.finishHintNotice";
  return null;
});

// Single "Edit details" button -> one modal for the whole group (Łukasz, 2026-09-16) rather
// than per-field inputs or per-field edit icons, specifically so a doctor can't change a field
// just by tapping into it while reading — edits only land in clinicName/etc. (above) on explicit
// Save; Cancel discards the drafts below untouched.
const showEditDialog = ref(false);
const editFormRef = ref<{ validate: () => Promise<{ valid: boolean }>; $el?: Element } | null>(null);
const draftClinicName = ref("");
const draftClinicEmail = ref("");
const draftClinicPhone = ref("");
const draftTaxId = ref("");
const draftBillingAddress = ref("");
const draftLicenseNumber = ref("");
const draftPracticeRole = ref<PracticeRole>("staff");

/** The committed value of each practice detail — what Save diffs the drafts against. */
function committedDetails(): Record<(typeof CLINIC_KEYS)[number], string> {
  return {
    licenseNumber: licenseNumber.value,
    practiceRole: practiceRole.value,
    clinicName: clinicName.value,
    clinicEmail: clinicEmail.value,
    clinicPhone: clinicPhone.value,
    taxId: taxId.value,
    billingAddress: billingAddress.value,
  };
}

const dialogErrorList = dialogErrors.errorListFor((): FormErrorField[] => [
  { key: "practiceRole", label: t("user.partnerRegistration.form.practiceRole"), value: draftPracticeRole.value },
  { key: "licenseNumber", label: licenseLabel.value, value: draftLicenseNumber.value, rules: [(v) => ruleLicenseNumber(String(v ?? ""))] },
  { key: "clinicName", label: t("user.partnerRegistration.form.clinicName"), value: draftClinicName.value, rules: [(v) => ruleClinicNameRequired(String(v ?? ""))] },
  { key: "clinicEmail", label: t("user.partnerRegistration.form.clinicEmail"), value: draftClinicEmail.value, rules: [(v) => ruleClinicEmailRequired(String(v ?? ""))] },
  { key: "clinicPhone", label: t("user.partnerRegistration.form.clinicPhone"), value: draftClinicPhone.value, rules: [(v) => ruleClinicPhoneRequired(String(v ?? ""))] },
  { key: "taxId", label: t("user.partnerRegistration.form.taxId"), value: draftTaxId.value, rules: [(v) => ruleTaxId(String(v ?? ""))] },
  { key: "billingAddress", label: t("user.partnerRegistration.form.billingAddress"), value: draftBillingAddress.value, rules: [(v) => ruleBillingAddressRequired(String(v ?? ""))] },
]);

/** Opens the details dialog; `focusKey` (from a summary link) puts the cursor in that field. */
async function openEditDialog(focusKey?: string) {
  draftClinicName.value = clinicName.value;
  draftClinicEmail.value = clinicEmail.value;
  draftClinicPhone.value = clinicPhone.value;
  draftTaxId.value = taxId.value;
  draftBillingAddress.value = billingAddress.value;
  draftLicenseNumber.value = licenseNumber.value;
  draftPracticeRole.value = practiceRole.value;
  // The details the API rejected open already marked; otherwise the dialog starts clean.
  const rejected: FieldErrors = Object.fromEntries(
    Object.entries(mainErrors.serverErrors.value).filter(([key]) => (CLINIC_KEYS as readonly string[]).includes(key)),
  );
  if (Object.keys(rejected).length) dialogErrors.setServerErrors(rejected, CLINIC_KEYS);
  else dialogErrors.reset();
  showEditDialog.value = true;
  if (focusKey) {
    await nextTick();
    focusField(focusKey);
  }
}

function cancelEditDialog() {
  showEditDialog.value = false;
}

async function saveEditDialog() {
  dialogErrors.attempted.value = true;
  const result = await editFormRef.value?.validate();
  if (!result?.valid || dialogErrorList.value.length) {
    scrollToFormTop(editFormRef.value?.$el);
    return;
  }
  // A rejected detail the doctor changed is no longer the value the API saw.
  const before = committedDetails();
  const drafts: Record<(typeof CLINIC_KEYS)[number], string> = {
    licenseNumber: draftLicenseNumber.value.trim(),
    practiceRole: draftPracticeRole.value,
    clinicName: draftClinicName.value.trim(),
    clinicEmail: draftClinicEmail.value.trim(),
    clinicPhone: draftClinicPhone.value.trim(),
    taxId: draftTaxId.value.trim(),
    billingAddress: draftBillingAddress.value.trim(),
  };
  for (const key of CLINIC_KEYS) {
    if (drafts[key] !== before[key]) mainErrors.clearServerError(key);
  }
  clinicName.value = draftClinicName.value.trim();
  clinicEmail.value = draftClinicEmail.value.trim();
  clinicPhone.value = draftClinicPhone.value.trim();
  taxId.value = draftTaxId.value.trim();
  billingAddress.value = draftBillingAddress.value.trim();
  licenseNumber.value = draftLicenseNumber.value.trim();
  practiceRole.value = draftPracticeRole.value;
  showEditDialog.value = false;
}

const documentDialogOpen = ref(false);
const openKind = ref<"agreement" | "notice">("agreement");

// Whether the doctor has opened each document at all — the tiles show
// "not opened" → "opened" → "signed"/"read", so progress is visible at a glance.
const agreementOpened = ref(false);
const noticeOpened = ref(false);

type DocumentState = "notOpened" | "opened" | "done";
const agreementState = computed<DocumentState>(() =>
  agreementSignature.value ? "done" : agreementOpened.value ? "opened" : "notOpened"
);
const noticeState = computed<DocumentState>(() =>
  noticeVersionId.value ? "done" : noticeOpened.value ? "opened" : "notOpened"
);

function openDocument(kind: "agreement" | "notice") {
  openKind.value = kind;
  if (kind === "agreement") agreementOpened.value = true;
  else noticeOpened.value = true;
  documentDialogOpen.value = true;
}

function onAgreementSigned(payload: { signatureDataUrl: string; versionIds: string[] }) {
  agreementSignature.value = payload.signatureDataUrl;
  agreementVersionIds.value = payload.versionIds;
  infoKey.value = null;
}

function onNoticeAcknowledged(payload: { versionIds: string[] }) {
  noticeVersionId.value = payload.versionIds[0] ?? null;
}

// Same computed pattern as AuthView.vue — true while the initial token
// validation is in flight.
const loading = computed(() => step.value === "loading");

const inviteFailure = ref<unknown>(null);
const inviteFailureText = useErrorTextFor(inviteFailure);

const cardTitle = computed(() => {
  if (step.value === "invalid") return t("user.partnerRegistration.invalidTitle");
  if (step.value === "unreachable" && inviteFailureText.value) return inviteFailureText.value.title;
  return t("user.partnerRegistration.title");
});

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
function ruleTaxId(v: string) {
  return draftPracticeRole.value !== "owner" || !!v.trim() || t("user.partnerRegistration.form.validation.taxIdRequired");
}
function ruleBillingAddressRequired(v: string) {
  return !!v.trim() || t("user.partnerRegistration.form.validation.billingAddressRequired");
}
function ruleLicenseNumber(v: string) {
  if (!v.trim()) return t("user.partnerRegistration.form.validation.licenseRequired");
  const country = jurisdiction.value ?? "PL";
  return (
    isValidLicenseNumber(country, v) ||
    t(country === "MX" ? "app.identity.form.validation.cedulaInvalid" : "app.identity.form.validation.pwzInvalid")
  );
}

async function loadInvite(): Promise<void> {
  if (!token) { step.value = "invalid"; return; }
  step.value = "loading";
  inviteFailure.value = null;
  try {
    const res = await apiFetch(`/api/v1/invite/validate?token=${encodeURIComponent(token)}`, { handleErrors: false });
    if (res.ok) {
      const data = (await res.json()) as InvitePreview;
      preview.value = data;
      clinicName.value = data.clinicName ?? "";
      clinicEmail.value = data.clinicEmail ?? "";
      clinicPhone.value = data.clinicPhone ?? "";
      taxId.value = data.taxId ?? "";
      billingAddress.value = data.clinicAddress ?? "";
      licenseNumber.value = data.licenseNumber ?? "";
      practiceRole.value = data.practiceRole;
      if (!data.documents) errorKey.value = "user.partnerRegistration.form.errorNotReady";
      step.value = "form";
    } else {
      const failure = await apiErrorFromResponse(res);
      // Only a 4xx means the link itself is bad (expired / used / unknown) — an expected
      // outcome, not reported. A 5xx or 429 is our problem and must not tell the doctor
      // their invitation is invalid.
      if (failure.kind === "client") {
        step.value = "invalid";
      } else {
        reportCaught(failure, { where: "PartnerRegistrationView.loadInvite" });
        inviteFailure.value = failure;
        step.value = "unreachable";
      }
    }
  } catch (err) {
    reportCaught(err, { where: "PartnerRegistrationView.loadInvite" });
    inviteFailure.value = err;
    step.value = "unreachable";
  }
}

onMounted(loadInvite);

function resetSigning() {
  agreementSignature.value = null;
  agreementVersionIds.value = null;
  noticeVersionId.value = null;
}

function showFormErrors() {
  void nextTick(() => scrollToFormTop(formRef.value?.$el));
}

async function onSubmit() {
  mainErrors.attempted.value = true;
  formLevelErrorKey.value = null;
  const form = await formRef.value?.validate();
  if (!form?.valid || mainFieldErrors.value.length || finishHintKey.value) {
    showFormErrors();
    return;
  }
  const [agreementVersionId, dpaVersionId] = agreementVersionIds.value ?? [];

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
        licenseNumber: licenseNumber.value,
        practiceRole: practiceRole.value,
        agreementSignatureDataUrl: agreementSignature.value,
        agreementVersionId,
        dpaVersionId,
        noticeVersionId: noticeVersionId.value,
        noticeAcknowledged: !!noticeVersionId.value,
      }),
    });
    if (res.ok) {
      step.value = "submitted";
      startLoginRedirect();
      return;
    }
    // A 400 naming a field (NEO-109): mark it on the page, no alert. "token"
    // is the link itself (expired / already used) — a line about the whole form.
    const fieldErrors = await fieldErrorsFromResponse(res);
    if (fieldErrors?.token) {
      formLevelErrorKey.value = "user.partnerRegistration.form.errorInvalidLink";
      showFormErrors();
      return;
    }
    if (fieldErrors && mainErrors.setServerErrors(fieldErrors, [...PASSWORD_KEYS, ...CLINIC_KEYS])) {
      showFormErrors();
      return;
    }
    const failure = await apiErrorFromResponse(res);
    if (failure.code === "DOCUMENT_VERSION_STALE") {
      resetSigning();
      formLevelErrorKey.value = "user.partnerRegistration.form.errorStale";
      showFormErrors();
    } else if (failure.code === "PARTNER_DOCUMENTS_NOT_READY") {
      errorKey.value = "user.partnerRegistration.form.errorNotReady";
    } else {
      // Anything unexpected is reported — a doctor's signed registration must never fail silently.
      reportCaught(failure, { where: "PartnerRegistrationView.onSubmit" });
      errorKey.value = "user.partnerRegistration.form.errorSubmit";
    }
  } catch (err) {
    reportCaught(err, { where: "PartnerRegistrationView.onSubmit" });
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
  /* The scroller is its own full-viewport layer (fixed, inset 0) rather than
     a 100%-height child of PublicLayout's <main>, which sits inside a 16px
     safe-area frame (--layout-public-inset-*). As a child, a wheel/swipe that
     started in that frame scrolled nothing — and WebKit (Safari) routes
     wheel scrolling by layer bounds, so even a negative-margin extension
     under the frame didn't receive it there. The frame is added back as
     padding so the card keeps its place. */
  --pr-inset-top: var(--layout-public-inset-top, 16px);
  --pr-inset-right: var(--layout-public-inset-right, 16px);
  --pr-inset-bottom: var(--layout-public-inset-bottom, 16px);
  --pr-inset-left: var(--layout-public-inset-left, 16px);
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: calc(clamp(24px, 10vh, 96px) + var(--pr-inset-top)) calc(16px + var(--pr-inset-right))
    calc(40px + var(--pr-inset-bottom)) calc(16px + var(--pr-inset-left));
  gap: 16px;
}

/* flex-shrink: 0 is the fix for the long-standing "form can't be scrolled"
   bug (2026-09-16 story addendum): as a flex item of the 100%-height column
   above, the card shrank to the viewport, and VCard's own overflow:hidden
   clipped everything below — so this container never had anything to
   scroll. Keeping the card at its content height lets .partner-registration
   scroll it (measured on a 390x844 viewport, NEO-51). */
.partner-registration__card {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
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

@media (max-width: 480px) {
  .partner-registration__body,
  .partner-registration__loading {
    padding: 8px 20px 24px;
  }
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
  /* Air between Edit details and the box's top-right corner — 20px top / 24px
     right in total with the box padding; on the row, not the button, so the
     heading stays centred with it (Łukasz, NEO-51 review). */
  padding: 8px 8px 0 0;
}

.partner-registration__clinic-details-heading {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

/* Tonal fill + pencil icon instead of the old flat text link — Łukasz found
   the edit action too easy to miss (NEO-51). */
.partner-registration__edit-button {
  text-transform: none;
  letter-spacing: normal;
  flex-shrink: 0;
}

.partner-registration__edit-button :deep(.v-btn__prepend) {
  margin-inline-end: 8px;
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

.partner-registration__clinic-details-error {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-error));
}

.partner-registration__clinic-details-empty {
  color: rgb(var(--v-theme-error));
  font-style: italic;
}

.partner-registration__documents-heading {
  margin: 24px 0 8px;
  font-size: 0.9375rem;
  font-weight: 600;
}

.partner-registration__documents {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.partner-registration__submit {
  margin-top: 24px;
  text-transform: none;
  letter-spacing: normal;
}

.partner-registration__finish-hint {
  margin: 8px 0 0;
  font-size: 0.8125rem;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
