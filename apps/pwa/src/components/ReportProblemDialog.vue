<template>
  <AppFormDialog
    :model-value="state.open"
    :title="title"
    max-width="520"
    @update:model-value="onModelValue"
    @close="close"
  >
    <form class="report-dialog" novalidate data-testid="report-problem-form" @submit.prevent="onSubmit">
      <ChoiceChipsField v-model="kind" :label="t('report.kind.label')" :items="kindItems" :disabled="sending" />

      <VTextarea
        v-model="description"
        :label="t('report.description.label')"
        :placeholder="t('report.description.placeholder')"
        :error-messages="descriptionError"
        :counter="DESCRIPTION_MAX"
        :disabled="sending"
        variant="outlined"
        rows="4"
        auto-grow
        max-rows="10"
        hide-details="auto"
        data-testid="report-description"
      />

      <div class="report-dialog__file">
        <input
          ref="fileInput"
          type="file"
          class="report-dialog__file-input"
          accept="image/*,application/pdf"
          data-testid="report-file-input"
          @change="onFileChosen"
        >
        <div v-if="file" class="report-dialog__file-chip" data-testid="report-file-chip">
          <AppIcon name="paperclip" class="report-dialog__file-icon" />
          <span class="report-dialog__file-name">{{ file.name }}</span>
          <AppButton
            icon
            variant="text"
            size="small"
            :title="t('report.file.remove')"
            :aria-label="t('report.file.remove')"
            :disabled="sending"
            @click="removeFile"
          >
            <AppIcon name="close" class="report-dialog__file-icon" />
          </AppButton>
        </div>
        <AppButton v-else variant="text" :disabled="sending" @click="fileInput?.click()">
          <template #prepend><AppIcon name="paperclip" class="report-dialog__file-icon" /></template>
          {{ t("report.file.add") }}
        </AppButton>
        <p v-if="fileError" class="report-dialog__error" role="alert" data-testid="report-file-error">{{ fileError }}</p>
      </div>

      <p v-if="requestRef" class="report-dialog__ref" data-testid="report-reference">
        <span class="report-dialog__ref-chip">{{ t("report.reference", { id: requestRef }) }}</span>
      </p>

      <p v-if="draftRestored" class="report-dialog__draft" role="status" data-testid="report-draft-restored">{{ t("report.draftRestored") }}</p>
      <p class="report-dialog__note">{{ t("report.autoAttached") }}</p>
      <p v-if="submitError" class="report-dialog__error" role="alert" data-testid="report-submit-error">{{ submitError }}</p>
    </form>
    <template #actions>
      <VSpacer />
      <AppButton variant="text" :disabled="sending" @click="close">{{ t("app.common.cancel") }}</AppButton>
      <AppButton color="primary" variant="flat" :loading="sending" data-testid="report-submit" @click="onSubmit">
        {{ t("report.submit") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useAppVersionParts } from "@ui";
import AppFormDialog from "./AppFormDialog.vue";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import ChoiceChipsField from "./ChoiceChipsField.vue";
import { clearReportDraft, readReportDraft, saveReportDraft, useReportProblem } from "../composables/useReportProblem";
import { useNotifications } from "../composables/useNotifications";
import type { ProblemKind } from "../types/issues";

/**
 * The one "Report a problem" / "Feedback" dialog, mounted once in AppLayout and opened through
 * useReportProblem().open(prefill). Doctors see it worded as "Feedback"; the form is the same.
 */
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;
const FILE_MAX_MB = 5;
const FILE_MAX_BYTES = FILE_MAX_MB * 1024 * 1024;

const { t } = useI18n();
const { state, close, submit } = useReportProblem();
const appVersion = useAppVersionParts();
const notifications = useNotifications();

const kind = ref<ProblemKind>("problem");
const description = ref("");
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const fileError = ref("");
const submitError = ref("");
const attempted = ref(false);
const sending = ref(false);
/** An unsent report from an earlier try was put back into the form. */
const draftRestored = ref(false);

// One name for every role (decision form core-141-decisions, D3): the kind chips say whether it's a problem.
const title = computed(() => t("report.title.feedback"));
const kindItems = computed(() =>
  (["problem", "suggestion", "other"] as const).map((value) => ({ value, title: t(`report.kind.${value}`) })),
);
const requestRef = computed(() => state.prefill.requestId?.slice(0, 8) ?? "");

const trimmedLength = computed(() => description.value.trim().length);
const descriptionError = computed(() => {
  if (!attempted.value && trimmedLength.value <= DESCRIPTION_MAX) return "";
  if (trimmedLength.value < DESCRIPTION_MIN) return t("report.description.tooShort", { min: DESCRIPTION_MIN });
  if (trimmedLength.value > DESCRIPTION_MAX) return t("report.description.tooLong", { max: DESCRIPTION_MAX });
  return "";
});

// Every opening starts from a clean form, or from the report that could not be sent last time.
watch(
  () => state.open,
  (open) => {
    if (!open) return;
    const draft = readReportDraft();
    draftRestored.value = !!draft;
    kind.value = draft?.kind ?? "problem";
    description.value = draft?.description ?? "";
    file.value = null;
    fileError.value = "";
    submitError.value = "";
    attempted.value = false;
    sending.value = false;
  },
);

function onModelValue(value: boolean) {
  if (!value) close();
}

function onFileChosen(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const chosen = input.files?.[0] ?? null;
  input.value = "";
  fileError.value = "";
  if (!chosen) return;
  if (!chosen.type.startsWith("image/") && chosen.type !== "application/pdf") {
    fileError.value = t("report.file.badType");
    return;
  }
  if (chosen.size > FILE_MAX_BYTES) {
    fileError.value = t("report.file.tooLarge", { max: FILE_MAX_MB });
    return;
  }
  file.value = chosen;
}

function removeFile() {
  file.value = null;
  fileError.value = "";
}

async function onSubmit() {
  if (sending.value) return;
  attempted.value = true;
  submitError.value = "";
  if (trimmedLength.value < DESCRIPTION_MIN || trimmedLength.value > DESCRIPTION_MAX) return;
  sending.value = true;
  const result = await submit({
    kind: kind.value,
    description: description.value,
    file: file.value,
    appVersion: appVersion.value.version,
  });
  sending.value = false;
  if (result.ok) {
    clearReportDraft();
    draftRestored.value = false;
    notifications.show(t("report.sentTracked", { number: result.number }), "success", undefined, { icon: "message" });
    close();
    return;
  }
  // Kept on the device so closing the dialog doesn't lose it; a 4xx other than 429 is a form problem.
  const retryable = result.status === null || result.status === 429 || result.status >= 500;
  const kept = retryable && saveReportDraft({ kind: kind.value, description: description.value });
  submitError.value = result.status === 429 ? t("report.rateLimited") : t(kept ? "report.failedKept" : "report.failed");
}
</script>

<style scoped>
.report-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.report-dialog__draft {
  margin: 0;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.8125rem;
  background: rgba(var(--v-theme-info), 0.1);
}

.report-dialog__file {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.report-dialog__file-input {
  display: none;
}

.report-dialog__file-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-height: 40px;
  padding: 0 4px 0 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.report-dialog__file-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.report-dialog__file-name {
  min-width: 0;
  overflow: hidden;
  font-size: 0.875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-dialog__ref {
  margin: 0;
}

.report-dialog__ref-chip {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.report-dialog__note {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.report-dialog__error {
  margin: 0;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-error));
}
</style>
