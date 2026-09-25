<template>
  <VDialog :model-value="modelValue" max-width="420" :transition="originDialogTransition" @update:model-value="emit('update:modelValue', $event)">
    <VCard class="qr-dialog pwa-form-dialog__card">
      <AppDialogHeader :title="t('app.clinical.qr.title')" @close="emit('update:modelValue', false)" />
      <VCardText class="qr-dialog__body">
        <p class="qr-dialog__kind">{{ title }}</p>

        <div v-if="completed" class="qr-dialog__done" role="status">
          <AppIcon name="check-circle" class="qr-dialog__done-icon" />
          <p>{{ t("app.clinical.qr.completed") }}</p>
        </div>
        <template v-else>
          <img v-if="qrDataUrl" :src="qrDataUrl" :alt="t('app.clinical.qr.title')" class="qr-dialog__code" width="264" height="264" />
          <p class="qr-dialog__instructions">{{ t("app.clinical.qr.instructions") }}</p>
          <p class="qr-dialog__waiting" role="status">
            <VProgressCircular indeterminate size="16" width="2" />
            {{ progress && progress.total > 1 ? t("app.clinical.qr.progress", progress) : t("app.clinical.qr.waiting") }}
          </p>
        </template>
      </VCardText>
      <VCardActions>
        <AppButton v-if="!completed && url" variant="text" @click="copyLink">{{ t("app.clinical.qr.copyLink") }}</AppButton>
        <VSpacer />
        <AppButton variant="text" @click="emit('update:modelValue', false)">{{ t("app.common.close") }}</AppButton>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppDialogHeader from "../AppDialogHeader.vue";
import QRCode from "qrcode";
import { originDialogTransition } from "@ui";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import { useNotifications } from "../../composables/useNotifications";

/**
 * Shows the patient self-fill link as a QR code (rendered locally — the
 * link is a credential, it never goes to a third-party QR service) and
 * polls while open, so the doctor sees the moment the patient submits.
 */
// 15 s, and only for 15 min: the doctor's device and a patient's phone
// usually share the clinic Wi-Fi's one public IP — and so the API's per-IP
// rate limit; fast polling left open could starve the patient's submit.
const POLL_MS = 15_000;
const POLL_MAX_MS = 15 * 60_000;

const props = defineProps<{
  modelValue: boolean;
  /** What the link covers — one item's title, or "everything still missing". */
  title: string;
  url: string | null;
  /** Steps done so far on a multi-step link (the patient saves each step on its own). */
  progress?: { done: number; total: number } | null;
  completed: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [open: boolean]; poll: [] }>();
const { t } = useI18n();
const notifications = useNotifications();

const qrDataUrl = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.url,
  async (url) => {
    // SVG, not PNG: crisp at any size/zoom and needs no <canvas>.
    const svg = url ? await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;
    qrDataUrl.value = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  },
  { immediate: true }
);

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

watch(
  () => [props.modelValue, props.completed] as const,
  ([open, completed]) => {
    stopPolling();
    if (!open || completed) return;
    const startedAt = Date.now();
    timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_MAX_MS) return stopPolling();
      emit("poll");
    }, POLL_MS);
  },
  { immediate: true }
);
onBeforeUnmount(stopPolling);

async function copyLink() {
  if (!props.url) return;
  try {
    await navigator.clipboard.writeText(props.url);
    notifications.show(t("app.clinical.qr.copied"), "success", undefined, { icon: "qr-code" });
  } catch (err) {
    reportCaught(err, { where: "QuestionnaireQrDialog.copyLink", level: "warn" });
    // Clipboard API unavailable (insecure context / denied) — nothing else to do.
  }
}
</script>

<style scoped>
.qr-dialog__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}
.qr-dialog__kind {
  margin: 0;
  font-weight: 600;
}
.qr-dialog__code {
  width: 264px;
  height: 264px;
  max-width: 100%;
  image-rendering: pixelated;
  background: #fff;
  border-radius: var(--pwa-radius);
}
.qr-dialog__instructions {
  margin: 0;
  font-size: 0.875rem;
}
.qr-dialog__waiting {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.qr-dialog__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: rgb(var(--v-theme-success));
}
.qr-dialog__done-icon {
  width: 48px;
  height: 48px;
  font-size: 48px;
}
.qr-dialog__done p {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
}
</style>
