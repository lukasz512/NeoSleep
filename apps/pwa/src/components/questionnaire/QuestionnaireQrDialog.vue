<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="420"
    :title="t('app.clinical.qr.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <div class="qr-dialog__body">
      <p class="qr-dialog__kind">{{ title }}</p>

      <img v-if="qrDataUrl" :src="qrDataUrl" :alt="t('app.clinical.qr.title')" class="qr-dialog__code" width="264" height="264" />
      <p class="qr-dialog__instructions">{{ t("app.clinical.qr.instructions") }}</p>
    </div>

    <template #actions>
      <AppButton v-if="url" variant="text" @click="copyLink">{{ t("app.clinical.qr.copyLink") }}</AppButton>
      <VSpacer />
      <AppButton variant="text" @click="emit('update:modelValue', false)">{{ t("app.common.close") }}</AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import QRCode from "qrcode";
import AppButton from "../AppButton.vue";
import { useNotifications } from "../../composables/useNotifications";

/**
 * Shows the patient self-fill link as a QR code (rendered locally — the
 * link is a credential, it never goes to a third-party QR service). Nothing
 * else: the parent closes it once the patient has opened the link (NEO-110),
 * and progress is followed on the Estudios QR status button (NEO-93).
 */
const props = defineProps<{
  modelValue: boolean;
  /** What the link covers — one item's title, or "everything still missing". */
  title: string;
  url: string | null;
}>();
const emit = defineEmits<{ "update:modelValue": [open: boolean] }>();
const { t } = useI18n();
const notifications = useNotifications();

const qrDataUrl = ref<string | null>(null);

watch(
  () => props.url,
  async (url) => {
    // SVG, not PNG: crisp at any size/zoom and needs no <canvas>.
    const svg = url ? await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;
    qrDataUrl.value = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  },
  { immediate: true }
);

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
</style>
