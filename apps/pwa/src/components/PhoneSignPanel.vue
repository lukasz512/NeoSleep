<template>
  <div class="phone-sign" role="region" :aria-label="t('app.phoneSign.label')">
    <img v-if="state === 'waiting' && qrDataUrl" :src="qrDataUrl" :alt="t('app.phoneSign.label')" class="phone-sign__code" width="148" height="148" />
    <div v-else-if="state === 'loading'" class="phone-sign__code phone-sign__code--empty" role="status">
      <VProgressCircular indeterminate color="primary" size="40" width="4" />
    </div>
    <div v-else class="phone-sign__code phone-sign__code--empty">
      <AppButton variant="tonal" color="primary" @click="begin">{{ t('app.phoneSign.newCode') }}</AppButton>
    </div>

    <p v-if="state === 'expired'" class="phone-sign__text" role="status">{{ t('app.phoneSign.expired') }}</p>
    <p v-else-if="state === 'error'" class="phone-sign__text" role="alert">{{ t('app.phoneSign.error') }}</p>
    <template v-else>
      <p class="phone-sign__text">{{ t('app.phoneSign.instructions') }}</p>
      <p v-if="state === 'waiting'" class="phone-sign__waiting" role="status" aria-live="polite">
        <VProgressCircular indeterminate size="14" width="2" />
        {{ t('app.phoneSign.waiting') }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VProgressCircular } from "vuetify/components";
import QRCode from "qrcode";
import AppButton from "./AppButton.vue";
import { apiFetch } from "../composables/useApi";
import { useVisiblePolling } from "../composables/useVisiblePolling";
import type { SignatureHandoffStart } from "../composables/signatureHandoffStart";

/**
 * "Sign on your phone" — the QR next to every signature pad on a computer
 * (CORE-166, CORE-172). The owner of the pad starts the handoff with its own
 * credential (`start`, see SignatureHandoffStart); the QR carries only a
 * sign-only link (/sign#<token>, the fragment never reaches a server log),
 * rendered locally. The panel polls with the pickup secret until the phone's
 * signature arrives and hands it over; the pad's owner treats it exactly
 * like one drawn with the mouse.
 */
const props = defineProps<{ start: SignatureHandoffStart }>();
const emit = defineEmits<{ signed: [signatureDataUrl: string] }>();
const { t } = useI18n();

const POLL_MS = 4000;

const state = ref<"loading" | "waiting" | "expired" | "error">("loading");
const pickupToken = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);

async function begin(): Promise<void> {
  state.value = "loading";
  pickupToken.value = null;
  try {
    const started = await props.start();
    if (!started) {
      state.value = "error";
      return;
    }
    const url = `${window.location.origin}/sign#${started.handoffToken}`;
    // SVG, not PNG: crisp at any size and needs no <canvas> (same as QuestionnaireQrDialog).
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    qrDataUrl.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    pickupToken.value = started.pickupToken;
    state.value = "waiting";
  } catch (err) {
    reportCaught(err, { where: "PhoneSignPanel.begin" });
    state.value = "error";
  }
}

async function poll(): Promise<void> {
  const p = pickupToken.value;
  if (!p || state.value !== "waiting") return;
  try {
    const res = await apiFetch("/api/v1/public/signature-handoff/pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p }),
      handleErrors: false,
    });
    if (!res.ok || p !== pickupToken.value) return;
    const result = (await res.json()) as { status: "pending" | "expired" | "signed"; signatureDataUrl?: string };
    if (result.status === "signed" && result.signatureDataUrl) {
      state.value = "loading";
      emit("signed", result.signatureDataUrl);
    } else if (result.status === "expired") {
      state.value = "expired";
    }
  } catch (err) {
    // benign: one missed poll (network blip) — the next tick tries again.
    reportCaught(err, { where: "PhoneSignPanel.poll", level: "warn" });
  }
}

useVisiblePolling(() => (state.value === "waiting" ? POLL_MS : null), poll);

onMounted(() => void begin());

/** Starts over with a fresh code — e.g. after the owner cleared a signature that came from the phone. */
defineExpose({ restart: begin });
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
  width: 148px;
  height: 148px;
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
  max-width: 220px;
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
</style>
