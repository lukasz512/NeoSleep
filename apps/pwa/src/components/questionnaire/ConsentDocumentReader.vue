<template>
  <AppFormDialog
    :model-value="modelValue"
    :title="title"
    :max-width="720"
    class="consent-reader"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
    @body-scroll="measure"
  >
    <template #header-extra>
      <div class="consent-reader__meta">
        <span>{{ subtitle }}</span>
        <span class="consent-reader__percent" data-testid="consent-reader-percent">{{ t("app.questionnaire.reader.progress", { n: percent }) }}</span>
      </div>
      <div class="consent-reader__track" aria-hidden="true">
        <span class="consent-reader__bar" :style="{ transform: `scaleX(${progress})` }" />
      </div>
    </template>

    <!-- A sheet of paper: the same text the patient signs, laid out like the printed document. -->
    <article class="consent-reader__paper" data-testid="consent-reader-paper">
      <h3 class="consent-reader__heading">{{ title }}</h3>
      <p v-if="patientName" class="consent-reader__for">{{ patientName }}</p>
      <!-- Server-sanitized to a tag allowlist (p, br, strong, em, u, ul, ol, li; no attributes) — commands/documentContent.ts sanitizeDocumentContentHtml. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="consent-reader__text" v-html="html" />
      <p class="consent-reader__sign-slot">{{ t("app.questionnaire.reader.signHere") }}</p>
    </article>

    <template #actions>
      <div class="consent-reader__actions">
        <p class="consent-reader__hint" :class="{ 'consent-reader__hint--done': reachedEnd }" aria-live="polite">
          <AppIcon v-if="reachedEnd" name="check" class="consent-reader__hint-icon" />
          {{ reachedEnd ? t("app.questionnaire.reader.readDone") : t("app.questionnaire.reader.scrollHint") }}
        </p>
        <AppButton
          color="primary"
          size="large"
          block
          :disabled="!reachedEnd"
          data-testid="consent-reader-continue"
          @click="finish"
        >
          {{ t("app.questionnaire.reader.continue") }}
        </AppButton>
      </div>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";

/**
 * The consent document, opened from its card on the patient page (NEO-126).
 * Reads like paper, shows how far the patient got, and only lets them go on
 * to sign once the last line has been on screen — "read it" is something
 * they did, not a checkbox they ticked. HTML, not a PDF: reflows on a phone
 * without zooming; the PDF is made once, after signing.
 */
const props = defineProps<{
  modelValue: boolean;
  title: string;
  /** Clinic · reading time, under the title. */
  subtitle: string;
  html: string;
  patientName?: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  /** The patient reached the end and chose to go on to signing. */
  read: [];
}>();

const { t } = useI18n();

/** 0..1 — how far down the text has been scrolled. */
const progress = ref(0);
/** Sticky: once the end has been seen, scrolling back up doesn't lock signing again. */
const reachedEnd = ref(false);
const percent = computed(() => Math.round(progress.value * 100));

function measure(el: HTMLElement) {
  const scrollable = el.scrollHeight - el.clientHeight;
  // A short text that fits on screen is read as soon as it's shown.
  const next = scrollable <= 4 ? 1 : Math.min(1, el.scrollTop / scrollable);
  progress.value = Math.max(progress.value, next);
  if (next >= 0.98) reachedEnd.value = true;
}

// The dialog reports its body on scroll/resize; measure once more after it
// opens in case neither fires (a text that fits needs no scrolling at all).
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    await nextTick();
    requestAnimationFrame(() => {
      const body = document.querySelector<HTMLElement>(".consent-reader [data-testid='app-form-dialog-body']");
      if (body) measure(body);
    });
  },
  { immediate: true },
);

function finish() {
  if (!reachedEnd.value) return;
  emit("read");
  emit("update:modelValue", false);
}
</script>

<style scoped>
.consent-reader__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px var(--pwa-dialog-pad, 24px) 10px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.consent-reader__percent {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.consent-reader__track {
  height: 3px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}

.consent-reader__bar {
  display: block;
  height: 100%;
  background: rgb(var(--v-theme-primary));
  transform-origin: left;
  transition: transform 150ms linear;
}

/* A sheet lying on a slightly darker desk — the document, not another form. */
.consent-reader__paper {
  margin: 4px 0;
  padding: 28px 24px 24px;
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(var(--v-border-color), var(--v-border-opacity));
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1rem;
  line-height: 1.65;
}

.consent-reader__heading {
  margin: 0;
  text-align: center;
  font-family: inherit;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.consent-reader__for {
  margin: 4px 0 20px;
  text-align: center;
  font-family: system-ui, sans-serif;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.consent-reader__text :deep(p) {
  margin: 0 0 12px;
}

.consent-reader__sign-slot {
  margin: 24px 0 0;
  padding-top: 12px;
  border-top: 1px dashed rgba(var(--v-border-color), 0.4);
  font-family: system-ui, sans-serif;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.consent-reader__actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.consent-reader__hint {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.consent-reader__hint--done {
  color: rgb(var(--v-theme-success));
  font-weight: 600;
}

.consent-reader__hint-icon {
  width: 16px;
  height: 16px;
}

@media (max-width: 599px) {
  .consent-reader__paper {
    padding: 20px 16px 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .consent-reader__bar {
    transition: none;
  }
}
</style>
