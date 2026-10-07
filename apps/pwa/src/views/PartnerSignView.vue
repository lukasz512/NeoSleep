<template>
  <div class="partner-sign">
    <AuthChrome />

    <AuthCard :title="cardTitle" :loading="step === 'loading' || sending" :step-key="step">
      <div v-if="step === 'loading'" class="partner-sign__body">
        <AppLoadingState />
      </div>

      <div v-else-if="step === 'expired'" class="partner-sign__body">
        <p class="partner-sign__text">{{ t('user.partnerSign.expiredBody') }}</p>
      </div>

      <div v-else-if="step === 'sent'" class="partner-sign__body">
        <AppInlineAlert type="success" :title="t('user.partnerSign.sentTitle')" :text="t('user.partnerSign.sentBody')" />
      </div>

      <div v-else class="partner-sign__body">
        <p class="partner-sign__text">{{ t('user.partnerSign.intro', { name: signerName, version: view?.versionLabel ?? '' }) }}</p>
        <ConsentSignatureField ref="fieldRef" @change="empty = $event" />
        <p v-if="sendFailed" class="partner-sign__error" role="alert">{{ t('user.partnerSign.sendError') }}</p>
        <AppButton color="primary" size="large" block class="partner-sign__submit" :disabled="empty || sending" @click="send">
          {{ t('user.partnerSign.send') }}
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
 * The phone half of "sign on your phone" (CORE-166): opened from the QR the
 * partner agreement dialog shows on a computer. /partner-sign#<token> — the
 * sign-only token lives in the fragment, which browsers never send to a
 * server. The doctor read the agreement on the computer; this page only
 * collects the signature (same full-screen sheet as the patient consent)
 * and sends it back, where it lands on the agreement preview.
 */

interface HandoffView {
  status: "pending" | "signed";
  firstName: string | null;
  lastName: string | null;
  versionLabel: string | null;
}

const { t } = useI18n();
const route = useRoute();
const handoffToken = computed(() => route.hash.replace(/^#/, ""));

const step = ref<"loading" | "expired" | "sign" | "sent">("loading");
const view = ref<HandoffView | null>(null);
const fieldRef = ref<InstanceType<typeof ConsentSignatureField> | null>(null);
const empty = ref(true);
const sending = ref(false);
const sendFailed = ref(false);

const signerName = computed(() => [view.value?.firstName, view.value?.lastName].filter(Boolean).join(" "));
const cardTitle = computed(() => (step.value === "expired" ? t("user.partnerSign.expiredTitle") : t("user.partnerSign.title")));

async function load(): Promise<void> {
  if (!handoffToken.value) {
    step.value = "expired";
    return;
  }
  try {
    const res = await apiFetch(`/api/v1/invite/sign-handoff?h=${encodeURIComponent(handoffToken.value)}`, { handleErrors: false });
    if (!res.ok) {
      step.value = "expired";
      return;
    }
    view.value = (await res.json()) as HandoffView;
    step.value = view.value.status === "signed" ? "sent" : "sign";
  } catch (err) {
    reportCaught(err, { where: "PartnerSignView.load" });
    step.value = "expired";
  }
}

async function send(): Promise<void> {
  const signatureDataUrl = fieldRef.value?.toDataURL();
  if (!signatureDataUrl) return;
  sending.value = true;
  sendFailed.value = false;
  try {
    const res = await apiFetch("/api/v1/invite/sign-handoff/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      handleErrors: false,
      body: JSON.stringify({ h: handoffToken.value, signatureDataUrl }),
    });
    if (res.status === 404) step.value = "expired";
    else if (res.ok) step.value = "sent";
    else sendFailed.value = true;
  } catch (err) {
    reportCaught(err, { where: "PartnerSignView.send" });
    sendFailed.value = true;
  } finally {
    sending.value = false;
  }
}

onMounted(() => void load());
</script>

<style scoped>
/* Same card insets and type as PartnerRegistrationView. */
.partner-sign__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 32px 32px;
}

@media (max-width: 480px) {
  .partner-sign__body {
    padding: 8px 20px 24px;
  }
}

.partner-sign__text {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.partner-sign__submit {
  text-transform: none;
  letter-spacing: normal;
}

.partner-sign__error {
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
}
</style>
