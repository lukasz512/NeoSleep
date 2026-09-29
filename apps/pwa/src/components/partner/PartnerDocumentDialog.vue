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

      <VCardText ref="bodyRef" class="partner-doc-dialog__body">
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
        <!-- Keyed so every open (and every new signature) gets a fresh
             document: the same srcdoc wouldn't fire load again, and a
             leftover signature image must never linger in the preview. -->
        <iframe
          v-show="state === 'ready'"
          :key="frameKey"
          ref="frameRef"
          class="partner-doc-dialog__frame"
          :style="{ height: frameHeight }"
          :srcdoc="preview?.html ?? ''"
          sandbox="allow-same-origin"
          :title="title"
          @load="onFrameLoad"
        />

        <!-- Signed: the preview above already shows both signatures, exactly
             as the PDF will; the doctor can still redraw theirs. -->
        <section
          v-if="kind === 'agreement' && state === 'ready' && shownSignature"
          class="partner-doc-dialog__signature partner-doc-dialog__signature--signed"
        >
          <h3 class="partner-doc-dialog__signature-heading">{{ t('user.partnerRegistration.dialog.signedHeading') }}</h3>
          <p class="partner-doc-dialog__intent">{{ t('user.partnerRegistration.dialog.signedBody') }}</p>
          <div class="partner-doc-dialog__pad">
            <AppButton variant="tonal" color="primary" class="partner-doc-dialog__change" @click="startResign">
              <template #prepend><AppIcon name="pencil" /></template>
              {{ t('user.partnerRegistration.dialog.changeSignature') }}
            </AppButton>
          </div>
        </section>

        <section v-else-if="kind === 'agreement' && state === 'ready'" class="partner-doc-dialog__signature">
          <h3 class="partner-doc-dialog__signature-heading">{{ t('user.partnerRegistration.dialog.signatureHeading') }}</h3>
          <p class="partner-doc-dialog__intent">
            {{ t('user.partnerRegistration.dialog.intent', { version: preview?.versionLabel ?? '' }) }}
          </p>
          <!-- As wide as a signature line in the document, not the whole dialog. -->
          <div class="partner-doc-dialog__pad">
            <SignaturePad
              ref="padRef"
              :clear-label="t('user.partnerRegistration.form.signatureClear')"
              :placeholder="t('user.partnerRegistration.dialog.signHere')"
              clear-placement="overlay"
              @change="padEmpty = $event"
            />
          </div>
        </section>
      </VCardText>

      <VCardActions class="partner-doc-dialog__actions">
        <VSpacer />
        <template v-if="kind === 'agreement' && shownSignature">
          <AppButton color="primary" variant="flat" @click="close">{{ t('user.partnerRegistration.dialog.done') }}</AppButton>
        </template>
        <template v-else-if="kind === 'agreement'">
          <AppButton v-if="signature" variant="text" @click="keepSignature">
            {{ t('user.partnerRegistration.dialog.keepSignature') }}
          </AppButton>
          <AppButton v-else variant="text" @click="close">{{ t('user.partnerRegistration.dialog.close') }}</AppButton>
          <AppButton color="primary" variant="flat" :disabled="state !== 'ready' || padEmpty" @click="onSign">
            {{ t('user.partnerRegistration.dialog.sign') }}
          </AppButton>
        </template>
        <template v-else-if="acknowledged">
          <AppButton color="primary" variant="flat" @click="close">{{ t('user.partnerRegistration.dialog.done') }}</AppButton>
        </template>
        <template v-else>
          <AppButton variant="text" @click="close">{{ t('user.partnerRegistration.dialog.close') }}</AppButton>
          <AppButton color="primary" variant="flat" :disabled="state !== 'ready'" @click="onAcknowledge">
            {{ t('user.partnerRegistration.dialog.acknowledge') }}
          </AppButton>
        </template>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { ref, computed, watch, nextTick } from "vue";
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
  /** The doctor's current signature on the agreement, if any — the dialog then opens on the signed preview. */
  signature?: string | null;
  /** Whether the privacy notice is already acknowledged — it stays readable, only the button changes. */
  acknowledged?: boolean;
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
const bodyRef = ref<InstanceType<typeof VCardText> | null>(null);
const frameKey = ref(0);

// "Change signature" swaps the signed preview back to the pad; the current
// signature only goes away if the doctor actually signs again.
const resigning = ref(false);
const shownSignature = computed(() => (props.kind === "agreement" && !resigning.value ? props.signature ?? null : null));

async function load(): Promise<void> {
  state.value = "loading";
  padEmpty.value = true;
  resigning.value = false;
  frameKey.value += 1;
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
  } catch (err) {
    reportCaught(err, { where: "PartnerDocumentDialog.load" });
    state.value = "error";
  }
}

function fitFrame(doc: Document): void {
  // The <html> box's own height, not scrollHeight: Safari/Firefox report
  // scrollHeight as at least the frame's current height, so a frame could
  // only ever grow (the short privacy notice inherited the agreement's
  // ~2900px). Body margins are outside <html>'s content box, so add them.
  const html = doc.documentElement;
  const bodyStyle = doc.defaultView?.getComputedStyle(doc.body);
  const margins = bodyStyle ? parseFloat(bodyStyle.marginTop) + parseFloat(bodyStyle.marginBottom) : 0;
  const height = Math.ceil(Math.max(html.getBoundingClientRect().height, doc.body.getBoundingClientRect().height + margins));
  if (height > 0) frameHeight.value = `${height + 8}px`;
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
  const signed = shownSignature.value;
  applyDocumentFields(doc, {
    dataFields: { ...preview.value.dataFields, ...props.party, signer_signed_at: today, acknowledged_at: today },
    imageFields: signed ? { ...preview.value.imageFields, signer_signature: signed } : preview.value.imageFields,
    variant: props.kind === "agreement" ? props.variant : null,
  });
  fitFrame(doc);
  // Web fonts and the signature image can land after load and change the height.
  await doc.fonts?.ready;
  await nextTick();
  fitFrame(doc);
  Array.from(doc.images).forEach((img) => img.addEventListener("load", () => fitFrame(doc), { once: true }));
  if (signed) scrollToSignatures(doc);
  if (signed && pendingFlight) {
    const flight = pendingFlight;
    pendingFlight = null;
    await flySignatureIntoDocument(doc, flight);
  }
}

// Set by onSign: where the doctor's ink sat on the pad, so the signed preview
// can carry it into the agreement's signature line instead of it just
// vanishing from the pad and reappearing (Łukasz, NEO-51 review).
let pendingFlight: { src: string; from: DOMRect } | null = null;
const FLIGHT_MS = 650;

async function flySignatureIntoDocument(doc: Document, flight: { src: string; from: DOMRect }): Promise<void> {
  const target = doc.querySelector<HTMLImageElement>('[data-image="signer_signature"] img');
  const frame = frameRef.value;
  if (!target || !frame) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // benign: decode() rejects for an image that can't be pre-decoded — the flight still works, just unwarmed.
  await target.decode().catch(() => undefined);
  const frameRect = frame.getBoundingClientRect();
  const imgRect = target.getBoundingClientRect();
  const to = new DOMRect(frameRect.left + imgRect.left, frameRect.top + imgRect.top, imgRect.width, imgRect.height);
  if (reduceMotion || !to.width || !flight.from.width || typeof document.body.animate !== "function") return;

  const ghost = document.createElement("img");
  ghost.src = flight.src;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${flight.from.left}px`,
    top: `${flight.from.top}px`,
    width: `${flight.from.width}px`,
    height: `${flight.from.height}px`,
    zIndex: "10000",
    pointerEvents: "none",
    transformOrigin: "0 0",
  });
  document.body.appendChild(ghost);
  target.style.opacity = "0";
  const dx = to.left - flight.from.left;
  const dy = to.top - flight.from.top;
  const sx = to.width / flight.from.width;
  const sy = to.height / flight.from.height;
  try {
    await ghost.animate(
      [
        { transform: "translate(0, 0) scale(1, 1)" },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
    ).finished;
  } catch {
    // benign: animation interrupted (dialog closed mid-flight) — just settle below.
  } finally {
    target.style.transition = "opacity 120ms ease-out";
    target.style.opacity = "1";
    ghost.remove();
  }
}

/** On the signed preview, land on the two signatures — that's what the doctor wants to check. */
function scrollToSignatures(doc: Document): void {
  const block = doc.querySelector(".sig-panels");
  const body = bodyRef.value?.$el as HTMLElement | undefined;
  const frame = frameRef.value;
  if (!(block instanceof HTMLElement) || !body || !frame) return;
  body.scrollTop = frame.offsetTop + block.offsetTop - 24;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);

// A new (or cleared) signature re-renders the document so the preview is
// always exactly what will be saved.
watch(shownSignature, () => {
  if (props.modelValue && state.value === "ready") frameKey.value += 1;
});

function close(): void {
  emit("update:modelValue", false);
}

function startResign(): void {
  padEmpty.value = true;
  resigning.value = true;
}

function keepSignature(): void {
  resigning.value = false;
}

function onSign(): void {
  const signatureDataUrl = padRef.value?.toDataURL({ trim: true });
  if (!signatureDataUrl || !preview.value) return;
  const from = padRef.value?.trimmedInkRect();
  pendingFlight = from ? { src: signatureDataUrl, from } : null;
  emit("signed", { signatureDataUrl, versionIds: preview.value.versionIds });
  // Stay open: the parent's new `signature` flips the dialog to the signed preview.
  resigning.value = false;
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

/* The pad is as wide as one signature line in the document (≈360px at the
   dialog's width), centred — never the full dialog (Łukasz, NEO-51 review). */
.partner-doc-dialog__pad {
  width: 100%;
  max-width: 360px;
  margin: 4px auto 0;
}

.partner-doc-dialog__signature--signed .partner-doc-dialog__pad {
  display: flex;
  justify-content: center;
}

.partner-doc-dialog__change {
  text-transform: none;
  letter-spacing: normal;
}

.partner-doc-dialog__change :deep(.v-btn__prepend) {
  margin-inline-end: 8px;
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
