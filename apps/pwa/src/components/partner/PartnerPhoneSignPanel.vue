<template>
  <div class="phone-sign" role="region" :aria-label="t('user.partnerRegistration.dialog.phoneButton')">
    <img v-if="state === 'waiting' && qrDataUrl" :src="qrDataUrl" :alt="t('user.partnerRegistration.dialog.phoneButton')" class="phone-sign__code" width="200" height="200" />
    <div v-else-if="state === 'loading'" class="phone-sign__code phone-sign__code--empty" role="status">
      <VProgressCircular indeterminate color="primary" size="40" width="4" />
    </div>
    <div v-else class="phone-sign__code phone-sign__code--empty">
      <AppButton variant="tonal" color="primary" @click="start">{{ t('user.partnerRegistration.dialog.phoneNewCode') }}</AppButton>
    </div>

    <p v-if="state === 'expired'" class="phone-sign__text" role="status">{{ t('user.partnerRegistration.dialog.phoneExpired') }}</p>
    <p v-else-if="state === 'error'" class="phone-sign__text" role="alert">{{ t('user.partnerRegistration.dialog.loadError') }}</p>
    <template v-else>
      <p class="phone-sign__text">{{ t('user.partnerRegistration.dialog.phoneInstructions') }}</p>
      <p v-if="state === 'waiting'" class="phone-sign__waiting" role="status" aria-live="polite">
        <VProgressCircular indeterminate size="14" width="2" />
        {{ t('user.partnerRegistration.dialog.phoneWaiting') }}
      </p>
    </template>

    <AppButton variant="text" class="phone-sign__back" @click="emit('cancel')">{{ t('user.partnerRegistration.dialog.phoneUseMouse') }}</AppButton>
  </div>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VProgressCircular } from "vuetify/components";
import QRCode from "qrcode";
import AppButton from "../AppButton.vue";
import { apiFetch } from "../../composables/useApi";
import { useVisiblePolling } from "../../composables/useVisiblePolling";

/**
 * "Sign on your phone" for the partner agreement (CORE-166). Mints a
 * sign-only link (/partner-sign#<token>, the token stays in the fragment and
 * never reaches a server log), shows it as a QR rendered locally, and polls
 * until the phone's signature arrives — then hands it to the dialog, which
 * treats it exactly like one drawn with the mouse.
 */
const props = defineProps<{ token: string }>();
const emit = defineEmits<{ signed: [signatureDataUrl: string]; cancel: [] }>();
const { t } = useI18n();

const POLL_MS = 4000;

const state = ref<"loading" | "waiting" | "expired" | "error">("loading");
const handoffToken = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);

async function start(): Promise<void> {
  state.value = "loading";
  handoffToken.value = null;
  try {
    const res = await apiFetch("/api/v1/invite/sign-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: props.token }),
      handleErrors: false,
    });
    if (!res.ok) {
      state.value = "error";
      return;
    }
    const { handoffToken: h } = (await res.json()) as { handoffToken: string };
    const url = `${window.location.origin}/partner-sign#${h}`;
    // SVG, not PNG: crisp at any size and needs no <canvas> (same as QuestionnaireQrDialog).
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    qrDataUrl.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    handoffToken.value = h;
    state.value = "waiting";
  } catch (err) {
    reportCaught(err, { where: "PartnerPhoneSignPanel.start" });
    state.value = "error";
  }
}

async function poll(): Promise<void> {
  const h = handoffToken.value;
  if (!h || state.value !== "waiting") return;
  try {
    const res = await apiFetch(
      `/api/v1/invite/sign-handoff/pickup?token=${encodeURIComponent(props.token)}&h=${encodeURIComponent(h)}`,
      { handleErrors: false },
    );
    if (!res.ok || h !== handoffToken.value) return;
    const result = (await res.json()) as { status: "pending" | "expired" | "signed"; signatureDataUrl?: string };
    if (result.status === "signed" && result.signatureDataUrl) {
      state.value = "loading";
      emit("signed", result.signatureDataUrl);
    } else if (result.status === "expired") {
      state.value = "expired";
    }
  } catch (err) {
    // benign: one missed poll (network blip) — the next tick tries again.
    reportCaught(err, { where: "PartnerPhoneSignPanel.poll", level: "warn" });
  }
}

useVisiblePolling(() => (state.value === "waiting" ? POLL_MS : null), poll);

onMounted(() => void start());
</script>

<style scoped>
.phone-sign {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.phone-sign__code {
  width: 200px;
  height: 200px;
  background: #fff;
  border-radius: var(--pwa-radius);
}

.phone-sign__code--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.phone-sign__text {
  margin: 0;
  max-width: 360px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.phone-sign__waiting {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 0.8125rem;
}

.phone-sign__back {
  text-transform: none;
  letter-spacing: normal;
}
</style>
