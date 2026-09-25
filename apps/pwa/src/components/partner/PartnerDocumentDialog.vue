<template>
  <VDialog
    :model-value="modelValue"
    :fullscreen="xs"
    max-width="880"
    scrollable
    :transition="originDialogTransition"
    @update:model-value="(open: boolean) => { if (!open) close(); }"
  >
    <VCard class="partner-doc-dialog">
      <div class="partner-doc-dialog__bar">
        <h2 class="partner-doc-dialog__title">{{ title }}</h2>
        <AppButton icon variant="text" size="small" :aria-label="t('user.partnerRegistration.dialog.close')" @click="close">
          <AppIcon name="close" />
        </AppButton>
      </div>

      <VCardText class="partner-doc-dialog__body">
        <div v-if="state === 'loading'" class="partner-doc-dialog__state">
          <AppLoadingState />
        </div>
        <div v-else-if="state === 'error'" class="partner-doc-dialog__state">
          <p>{{ t('user.partnerRegistration.dialog.loadError') }}</p>
          <AppButton variant="outlined" color="primary" @click="load">{{ t('user.partnerRegistration.dialog.retry') }}</AppButton>
        </div>

        <!-- The real document, rendered from the same template + content
             version the PDF will use, filled by the same applyDocumentFields
             (see packages/documents/src/browser/documentFields.ts). No
             allow-scripts: the frame is static; allow-same-origin only so this
             component can fill it. -->
        <iframe
          v-show="state === 'ready'"
          ref="frameRef"
          class="partner-doc-dialog__frame"
          :style="{ height: frameHeight }"
          :srcdoc="preview?.html ?? ''"
          sandbox="allow-same-origin"
          :title="title"
          @load="onFrameLoad"
        />

        <section v-if="kind === 'agreement' && state === 'ready'" class="partner-doc-dialog__signature">
          <h3 class="partner-doc-dialog__signature-heading">{{ t('user.partnerRegistration.dialog.signatureHeading') }}</h3>
          <p class="partner-doc-dialog__intent">
            {{ t('user.partnerRegistration.dialog.intent', { version: preview?.versionLabel ?? '' }) }}
          </p>
          <SignaturePad
            ref="padRef"
            :clear-label="t('user.partnerRegistration.form.signatureClear')"
            :placeholder="t('user.partnerRegistration.dialog.signHere')"
            clear-placement="overlay"
            @change="padEmpty = $event"
          />
        </section>
      </VCardText>

      <VCardActions class="partner-doc-dialog__actions">
        <VSpacer />
        <AppButton variant="text" @click="close">{{ t('user.partnerRegistration.dialog.close') }}</AppButton>
        <AppButton
          v-if="kind === 'agreement'"
          color="primary"
          variant="flat"
          :disabled="state !== 'ready' || padEmpty"
          @click="onSign"
        >
          {{ t('user.partnerRegistration.dialog.sign') }}
        </AppButton>
        <AppButton v-else color="primary" variant="flat" :disabled="state !== 'ready'" @click="onAcknowledge">
          {{ t('user.partnerRegistration.dialog.acknowledge') }}
        </AppButton>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { VDialog, VCard, VCardText, VCardActions, VSpacer } from "vuetify/components";
import { originDialogTransition } from "@ui";
import { applyDocumentFields } from "@documents-browser";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import SignaturePad from "../SignaturePad.vue";
import { apiFetch } from "../../composables/useApi";

/**
 * Shows one partner onboarding document exactly as it will be signed
 * (NEO-51) — NeoSleep's signature and date are already on it, the party
 * clause reflects the doctor's current (possibly just-edited) details — and
 * collects the doctor's signature (agreement) or read-acknowledgement
 * (privacy notice). Full-screen on phones.
 */

export interface PartnerDocumentPreview {
  html: string;
  dataFields: Record<string, string>;
  imageFields: Record<string, string>;
  versionIds: string[];
  versionLabel: string;
}

const props = defineProps<{
  modelValue: boolean;
  kind: "agreement" | "notice";
  token: string;
  title: string;
  /** Party fields from the registration form — doctor_name, license_number, clinic_name, tax_id, clinic_address, email. */
  party: Record<string, string>;
  /** "owner" | "staff" — which party clause the agreement shows. */
  variant: string;
  /** The document's jurisdiction — dates are shown in its language/time zone, like the PDF (apps/api formatDocumentDate). */
  jurisdiction: "PL" | "MX" | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  signed: [payload: { signatureDataUrl: string; versionIds: string[] }];
  acknowledged: [payload: { versionIds: string[] }];
}>();

const { t } = useI18n();
const { xs } = useDisplay();

const state = ref<"loading" | "error" | "ready">("loading");
const preview = ref<PartnerDocumentPreview | null>(null);
const frameRef = ref<HTMLIFrameElement | null>(null);
const frameHeight = ref("60vh");
const padRef = ref<InstanceType<typeof SignaturePad> | null>(null);
const padEmpty = ref(true);

async function load(): Promise<void> {
  state.value = "loading";
  padEmpty.value = true;
  try {
    const res = await apiFetch(
      `/api/v1/invite/document?token=${encodeURIComponent(props.token)}&type=${props.kind}`,
      { handleErrors: false },
    );
    if (!res.ok) {
      state.value = "error";
      return;
    }
    preview.value = (await res.json()) as PartnerDocumentPreview;
    state.value = "ready";
  } catch {
    state.value = "error";
  }
}

function fitFrame(doc: Document): void {
  frameHeight.value = `${Math.ceil(doc.documentElement.scrollHeight) + 8}px`;
}

/** Today, formatted the way the PDF will print the doctor's signing date (Finish stamps the real one server-side). */
function todayLabel(): string {
  const mx = props.jurisdiction === "MX";
  return new Intl.DateTimeFormat(mx ? "es-MX" : "pl-PL", {
    dateStyle: "long",
    timeZone: mx ? "America/Mexico_City" : "Europe/Warsaw",
  }).format(new Date());
}

async function onFrameLoad(): Promise<void> {
  const doc = frameRef.value?.contentDocument;
  if (!doc || !preview.value) return;
  const today = todayLabel();
  applyDocumentFields(doc, {
    dataFields: { ...preview.value.dataFields, ...props.party, signer_signed_at: today, acknowledged_at: today },
    imageFields: preview.value.imageFields,
    variant: props.kind === "agreement" ? props.variant : null,
  });
  fitFrame(doc);
  // Web fonts and the signature image can land after load and change the height.
  await doc.fonts?.ready;
  await nextTick();
  fitFrame(doc);
  Array.from(doc.images).forEach((img) => img.addEventListener("load", () => fitFrame(doc), { once: true }));
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);

function close(): void {
  emit("update:modelValue", false);
}

function onSign(): void {
  const signatureDataUrl = padRef.value?.toDataURL();
  if (!signatureDataUrl || !preview.value) return;
  emit("signed", { signatureDataUrl, versionIds: preview.value.versionIds });
  close();
}

function onAcknowledge(): void {
  if (!preview.value) return;
  emit("acknowledged", { versionIds: preview.value.versionIds });
  close();
}
</script>

<style scoped>
.partner-doc-dialog__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 12px 20px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.partner-doc-dialog__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.partner-doc-dialog__body {
  padding: 0 !important;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.partner-doc-dialog__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;
}

.partner-doc-dialog__frame {
  display: block;
  width: 100%;
  border: 0;
  background: #fff;
}

.partner-doc-dialog__signature {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  background: rgba(var(--v-theme-surface), 1);
  border-top: 1px dashed rgba(var(--v-theme-primary), 0.5);
}

.partner-doc-dialog__signature-heading {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.partner-doc-dialog__intent {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.partner-doc-dialog__actions {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 12px 16px;
}

.partner-doc-dialog__actions :deep(.v-btn) {
  text-transform: none;
  letter-spacing: normal;
}
</style>
