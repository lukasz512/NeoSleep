<template>
  <!-- Phones: the box only previews; signing happens on a full-screen sheet (NEO-100). -->
  <div v-if="isPhone" class="consent-signature">
    <button type="button" class="consent-signature__tap" :class="{ 'consent-signature__tap--signed': preview }" @click="open">
      <img v-if="preview" :src="preview" :alt="t('app.questionnaire.consentStep.signLabel')" class="consent-signature__preview" />
      <span v-else class="consent-signature__tap-label">
        <AppIcon name="pencil" />
        {{ t("app.questionnaire.consentStep.tapToSign") }}
      </span>
      <small v-if="preview" class="consent-signature__tap-hint">{{ t("app.questionnaire.consentStep.tapToRedo") }}</small>
    </button>

    <Teleport to="body">
      <div
        v-if="sheetOpen"
        ref="sheetRef"
        class="consent-signature__sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="t('app.questionnaire.consentStep.fullscreenTitle')"
      >
        <header class="consent-signature__bar">
          <AppButton variant="text" ignore-global-loading @click="close">{{ t("app.questionnaire.consentStep.cancel") }}</AppButton>
          <span class="consent-signature__title">{{ t("app.questionnaire.consentStep.fullscreenTitle") }}</span>
          <AppButton variant="text" color="error" ignore-global-loading :disabled="sheetEmpty" @click="sheetPadRef?.clear()">
            {{ t("app.questionnaire.consentStep.clear") }}
          </AppButton>
        </header>
        <p class="consent-signature__rotate-hint">
          <AppIcon name="phone-rotate" />
          {{ t("app.questionnaire.consentStep.rotateHint") }}
        </p>
        <div class="consent-signature__surface">
          <SignaturePad
            ref="sheetPadRef"
            fill
            clear-placement="none"
            :clear-label="t('app.questionnaire.consentStep.clear')"
            :placeholder="t('app.questionnaire.consentStep.signHere')"
            @change="sheetEmpty = $event"
          />
          <span class="consent-signature__baseline" aria-hidden="true" />
        </div>
        <footer class="consent-signature__footer">
          <AppButton color="primary" size="large" ignore-global-loading :disabled="sheetEmpty" class="consent-signature__use" @click="use">
            {{ t("app.questionnaire.consentStep.useSignature") }}
          </AppButton>
        </footer>
      </div>
    </Teleport>
  </div>

  <!-- Tablets / desktop: the inline pad is big enough; Clear sits inside it, far from the submit button. -->
  <SignaturePad
    v-else
    ref="inlinePadRef"
    class="consent-signature"
    @change="emit('change', $event)"
    clear-placement="overlay"
    :clear-label="t('app.questionnaire.consentStep.clear')"
    :placeholder="t('app.questionnaire.consentStep.signHere')"
  />
</template>

<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import SignaturePad from "../SignaturePad.vue";

/**
 * Patient consent signature (QR questionnaire, NEO-100). Same imperative API
 * as SignaturePad (isEmpty / toDataURL) so the view doesn't care which mode
 * is showing.
 *
 * One behavior for every phone: tapping the box opens a full-screen signing
 * sheet with Clear at the top and "Use this signature" at the bottom, so the
 * two can't be hit by the same thumb. Where the browser allows it (Android
 * Chrome: Fullscreen + Screen Orientation lock) the sheet also turns to
 * landscape by itself for a paper-like long line; where it doesn't (iPhone
 * Safari has neither API) the sheet stays portrait, suggests turning the
 * phone, and follows the rotation live.
 */

const { t } = useI18n();

/** Same contract as SignaturePad's: fires when the field goes from empty to signed or back (the view locks Send on it, NEO-99). */
const emit = defineEmits<{ change: [empty: boolean] }>();

/** Phone = touch-first and small in either dimension (a landscape phone is short, not narrow). */
const PHONE_QUERY = "(pointer: coarse) and (max-width: 599px), (pointer: coarse) and (max-height: 599px)";
const isPhone = window.matchMedia(PHONE_QUERY).matches;

const inlinePadRef = ref<InstanceType<typeof SignaturePad> | null>(null);
const sheetPadRef = ref<InstanceType<typeof SignaturePad> | null>(null);
const sheetRef = ref<HTMLDivElement | null>(null);
const sheetOpen = ref(false);
const sheetEmpty = ref(true);
/** The accepted signature (trimmed PNG) — both what the box previews and what gets submitted. */
const preview = ref<string | null>(null);

/**
 * `lock()` is Chrome/Android-only and missing from TypeScript's DOM lib, so
 * it is typed here and feature-detected at runtime.
 */
interface LockableOrientation {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
}

function orientationApi(): LockableOrientation | null {
  return typeof screen !== "undefined" && screen.orientation ? screen.orientation : null;
}

/** Best effort — every step may be refused; the sheet already works full-viewport without either. */
async function tryLandscape() {
  const el = sheetRef.value;
  const orientation = orientationApi();
  if (!el || !orientation?.lock || typeof el.requestFullscreen !== "function") return;
  try {
    await el.requestFullscreen({ navigationUI: "hide" });
    await orientation.lock("landscape");
  } catch {
    // benign: lock refused (rotation locked by the user, desktop-mode browser, …) — the sheet stays portrait.
  }
}

function releaseLandscape() {
  orientationApi()?.unlock?.();
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {
      // benign: the user may already have left fullscreen with the back gesture.
    });
  }
}

async function open() {
  sheetEmpty.value = true;
  sheetOpen.value = true;
  document.body.style.overflow = "hidden";
  await nextTick();
  // Must run inside the tap's user activation, hence straight after nextTick.
  await tryLandscape();
}

function close() {
  releaseLandscape();
  sheetOpen.value = false;
  document.body.style.overflow = "";
}

function use() {
  const signature = sheetPadRef.value?.toDataURL({ trim: true }) ?? null;
  if (signature) {
    preview.value = signature;
    emit("change", false);
  }
  close();
}

onBeforeUnmount(() => {
  if (sheetOpen.value) close();
});

function isEmpty(): boolean {
  return isPhone ? preview.value === null : (inlinePadRef.value?.isEmpty() ?? true);
}

function toDataURL(): string | null {
  return isPhone ? preview.value : (inlinePadRef.value?.toDataURL({ trim: true }) ?? null);
}

defineExpose({ isEmpty, toDataURL });
</script>

<style scoped>
.consent-signature {
  margin-bottom: 16px;
}

.consent-signature__tap {
  width: 100%;
  min-height: 112px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px;
  border: 1.5px dashed rgb(var(--v-theme-primary));
  border-radius: var(--pwa-radius, 8px);
  background: rgba(var(--v-theme-primary), 0.06);
  color: rgb(var(--v-theme-primary));
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}

.consent-signature__tap--signed {
  border-style: solid;
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
}

.consent-signature__tap:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.consent-signature__tap-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.consent-signature__preview {
  max-width: 100%;
  max-height: 72px;
}

.consent-signature__tap-hint {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-weight: 400;
}

.consent-signature__sheet {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  animation: consent-signature-in 0.25s ease-out;
}

@keyframes consent-signature-in {
  from { transform: translateY(24px); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .consent-signature__sheet { animation: none; }
}

.consent-signature__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.consent-signature__title {
  font-weight: 600;
  text-align: center;
}

.consent-signature__rotate-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 8px 16px 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.consent-signature__surface {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 12px 16px;
}

/* The pad's own dashed frame is enough on a full screen; the line gives the hand a target, like paper. */
.consent-signature__baseline {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 28%;
  border-bottom: 1.5px solid rgba(var(--v-theme-on-surface), 0.35);
  pointer-events: none;
}

.consent-signature__footer {
  padding: 8px 16px 16px;
}

.consent-signature__use {
  width: 100%;
}

/* Landscape — the wide, paper-like layout; the hint has done its job. */
@media (orientation: landscape) {
  .consent-signature__rotate-hint { display: none; }
  .consent-signature__surface { margin: 8px 24px; }
  .consent-signature__baseline { bottom: 24%; }
  .consent-signature__footer {
    display: flex;
    justify-content: flex-end;
    padding: 4px 24px 12px;
  }
  .consent-signature__use { width: auto; min-width: 240px; }
}
</style>
