<template>
  <div class="sign-on-phone">
    <AuthChrome />

    <AuthCard :title="cardTitle" :loading="step === 'loading' || sending" :step-key="step">
      <div v-if="step === 'loading'" class="sign-on-phone__body">
        <AppLoadingState />
      </div>

      <div v-else-if="step === 'expired'" class="sign-on-phone__body">
        <p class="sign-on-phone__text">{{ t('app.signOnPhone.expiredBody') }}</p>
      </div>

      <div v-else-if="step === 'sent'" class="sign-on-phone__body">
        <AppInlineAlert type="success" :title="t('app.signOnPhone.sentTitle')" :text="t('app.signOnPhone.sentBody')" />
      </div>

      <div v-else class="sign-on-phone__body">
        <p class="sign-on-phone__text">{{ intro }}</p>
        <ConsentSignatureField ref="fieldRef" @change="empty = $event" />
        <p v-if="sendFailed" class="sign-on-phone__error" role="alert">{{ t('app.signOnPhone.sendError') }}</p>
        <AppButton color="primary" size="large" block class="sign-on-phone__submit" :disabled="empty || sending" @click="send">
          {{ t('app.signOnPhone.send') }}
        </AppButton>
      </div>
    </AuthCard>
  </div>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { AuthChrome, AuthCard, AppInlineAlert } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import ConsentSignatureField from "../components/questionnaire/ConsentSignatureField.vue";
import { apiFetch } from "../composables/useApi";

/**
 * The phone half of "sign on your phone" (CORE-166, CORE-172): opened from
 * the QR next to a signature pad on a computer — the partner agreement, the
 * doctor's Historia clínica signature, the patient's consent on /q.
 * /sign#<token>: the sign-only token lives in the fragment (never sent to a
 * server) and travels to the API in POST bodies. The document was read on
 * the computer; this page only collects the signature (same full-screen
 * sheet as the patient consent) and sends it back to that pad.
 */

type Purpose = "partner_agreement" | "patient_consent" | "doctor_print";

interface HandoffView {
  status: "pending" | "signed";
  purpose: Purpose;
  signerName: string | null;
  versionLabel: string | null;
}

const INTRO_KEY: Record<Purpose, string> = {
  partner_agreement: "app.signOnPhone.intro.partnerAgreement",
  patient_consent: "app.signOnPhone.intro.patientConsent",
  doctor_print: "app.signOnPhone.intro.doctorPrint",
};

const { t } = useI18n();
const route = useRoute();
const handoffToken = computed(() => route.hash.replace(/^#/, ""));

const step = ref<"loading" | "expired" | "sign" | "sent">("loading");
const view = ref<HandoffView | null>(null);
const fieldRef = ref<InstanceType<typeof ConsentSignatureField> | null>(null);
const empty = ref(true);
const sending = ref(false);
const sendFailed = ref(false);

const intro = computed(() =>
  view.value ? t(INTRO_KEY[view.value.purpose], { name: view.value.signerName ?? "", version: view.value.versionLabel ?? "" }) : ""
);
const cardTitle = computed(() => (step.value === "expired" ? t("app.signOnPhone.expiredTitle") : t("app.signOnPhone.title")));

function post(path: string, body: Record<string, string>): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    handleErrors: false,
    body: JSON.stringify(body),
  });
}

async function load(): Promise<void> {
  if (!handoffToken.value) {
    step.value = "expired";
    return;
  }
  try {
    const res = await post("/api/v1/public/signature-handoff/lookup", { h: handoffToken.value });
    if (!res.ok) {
      step.value = "expired";
      return;
    }
    view.value = (await res.json()) as HandoffView;
    step.value = view.value.status === "signed" ? "sent" : "sign";
  } catch (err) {
    reportCaught(err, { where: "SignOnPhoneView.load" });
    step.value = "expired";
  }
}

async function send(): Promise<void> {
  const signatureDataUrl = fieldRef.value?.toDataURL();
  if (!signatureDataUrl) return;
  sending.value = true;
  sendFailed.value = false;
  try {
    const res = await post("/api/v1/public/signature-handoff/sign", { h: handoffToken.value, signatureDataUrl });
    if (res.status === 404) step.value = "expired";
    else if (res.ok) step.value = "sent";
    else sendFailed.value = true;
  } catch (err) {
    reportCaught(err, { where: "SignOnPhoneView.send" });
    sendFailed.value = true;
  } finally {
    sending.value = false;
  }
}

onMounted(() => void load());
</script>

<style scoped>
/* Same card insets and type as PartnerRegistrationView. */
.sign-on-phone__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 32px 32px;
}

@media (max-width: 480px) {
  .sign-on-phone__body {
    padding: 8px 20px 24px;
  }
}

.sign-on-phone__text {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.sign-on-phone__error {
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
}

.sign-on-phone__submit {
  text-transform: none;
  letter-spacing: normal;
}
</style>
