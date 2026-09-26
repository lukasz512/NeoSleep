<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="640"
    :title="t(KIND_LABEL_KEYS[kind])"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <p v-if="record" class="clinical-dialog__subtitle">{{ subtitle }}</p>
    <template v-if="kind === 'medical_history'">
      <QuestionnaireChecklist v-model="answers" :questions="MEDICAL_HISTORY_QUESTIONS" :readonly="readonly" />
      <p v-if="readonly && text.medical_history_other" class="clinical-dialog__other">
        <strong>{{ t("app.clinical.otherLabel") }}:</strong> {{ text.medical_history_other }}
      </p>
      <VTextField
        v-else-if="!readonly"
        v-model="text.medical_history_other"
        :label="t('app.clinical.otherLabel')"
        variant="outlined"
        density="comfortable"
        class="clinical-dialog__field"
      />
    </template>

    <template v-else-if="kind === 'oral_exam'">
      <QuestionnaireChecklist v-model="answers" :questions="ORAL_EXAM_QUESTIONS" :readonly="readonly" />
      <div class="clinical-dialog__row">
        <span>{{ t("app.clinical.skeletalClassLabel") }}</span>
        <strong v-if="readonly">{{ text.skeletal_class || "—" }}</strong>
        <VBtnToggle v-else v-model="text.skeletal_class" density="comfortable" color="primary" divided>
          <VBtn v-for="cls in SKELETAL_CLASSES" :key="cls" :value="cls" size="small">{{ cls }}</VBtn>
        </VBtnToggle>
      </div>
      <div class="clinical-dialog__row">
        <span>{{ t("app.clinical.toothLabel") }}</span>
        <strong v-if="readonly">{{ text.tooth || "—" }}</strong>
        <VTextField v-else v-model="text.tooth" variant="outlined" density="compact" hide-details class="clinical-dialog__tooth" />
      </div>
    </template>

    <template v-else>
      <h4 class="clinical-dialog__section">{{ t("app.clinical.section.stop") }}</h4>
      <QuestionnaireChecklist v-model="answers" :questions="STOP_QUESTIONS" :readonly="readonly || mode === 'completeBang'" />
      <h4 class="clinical-dialog__section">{{ t("app.clinical.section.bang") }}</h4>
      <QuestionnaireChecklist v-model="answers" :questions="BANG_QUESTIONS" :readonly="readonly" />
      <p v-if="mode === 'create'" class="clinical-dialog__hint">{{ t("app.clinical.bangOptional") }}</p>
      <p v-if="record?.score != null" class="clinical-dialog__score">
        {{ t("app.clinical.score", { score: record.score }) }} · {{ t(`app.clinical.risk.${stopBangRisk(record.score)}`) }}
      </p>
    </template>

    <template #actions>
      <AppButton v-if="record" variant="text" :loading="pdfLoading" @click="emit('pdf')">
        <template #prepend><AppIcon name="printer" /></template>
        {{ t("app.clinical.action.print") }}
      </AppButton>
      <VSpacer />
      <AppButton variant="text" @click="emit('update:modelValue', false)">
        {{ t(readonly ? "app.common.close" : "app.common.cancel") }}
      </AppButton>
      <AppButton v-if="!readonly" color="primary" :disabled="!canSave" :loading="saving" @click="onSave">
        {{ t(mode === "completeBang" ? "app.clinical.completeBang" : "app.clinical.save") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import { intlLocale } from "@i18n/language-options";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import QuestionnaireChecklist from "./QuestionnaireChecklist.vue";
import {
  MEDICAL_HISTORY_QUESTIONS,
  ORAL_EXAM_QUESTIONS,
  STOP_QUESTIONS,
  BANG_QUESTIONS,
  SKELETAL_CLASSES,
  KIND_LABEL_KEYS,
  stopBangRisk,
  type ClinicalRecordKind,
  type QuestionDef,
} from "../../config/questionnaires";
import type { ChecklistRecord as ClinicalRecord } from "../../composables/usePatientChecklist";

/**
 * One clinical questionnaire, three modes:
 * - create: staff fill it in chairside
 * - view: read-only answers of a saved record (+ PDF)
 * - completeBang: a STOP-Bang whose S-T-O-P the patient self-reported —
 *   S-T-O-P shown read-only, the clinician answers B-A-N-G
 */
const props = defineProps<{
  modelValue: boolean;
  kind: ClinicalRecordKind;
  mode: "create" | "view" | "completeBang";
  record?: ClinicalRecord | null;
  saving?: boolean;
  pdfLoading?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  save: [answers: Record<string, unknown>];
  pdf: [];
}>();
const { t, locale } = useI18n();

const answers = ref<Record<string, boolean | null>>({});
const text = reactive<{ medical_history_other: string; skeletal_class: string | null; tooth: string }>({
  medical_history_other: "",
  skeletal_class: null,
  tooth: "",
});

const readonly = computed(() => props.mode === "view");

const questionsForKind = computed<QuestionDef[]>(() => {
  if (props.kind === "medical_history") return MEDICAL_HISTORY_QUESTIONS;
  if (props.kind === "oral_exam") return ORAL_EXAM_QUESTIONS;
  return [...STOP_QUESTIONS, ...BANG_QUESTIONS];
});

// Reset from the record (or empty) every time the dialog opens.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const source = props.record ?? {};
    answers.value = Object.fromEntries(
      questionsForKind.value.map((q) => [q.key, (source as Record<string, unknown>)[q.key] as boolean | null ?? null])
    );
    text.medical_history_other = (props.record?.medical_history_other as string | null) ?? "";
    text.skeletal_class = props.record?.skeletal_class ?? null;
    text.tooth = (props.record?.tooth as string | null) ?? "";
  },
  { immediate: true }
);

const subtitle = computed(() => {
  if (!props.record) return "";
  const date = new Date(props.record.created_at).toLocaleDateString(intlLocale(locale.value));
  const who = props.record.source === "patient"
    ? t("app.clinical.source.patient")
    : props.record.recorded_by_name ? t("app.clinical.recordedBy", { name: props.record.recorded_by_name }) : "";
  return [date, who].filter(Boolean).join(" · ");
});

const canSave = computed(() => {
  if (props.kind === "stop_bang") {
    const stopDone = STOP_QUESTIONS.every((q) => answers.value[q.key] != null);
    const bangAnswered = BANG_QUESTIONS.filter((q) => answers.value[q.key] != null).length;
    // B-A-N-G: all or nothing — and required when completing.
    return stopDone && (props.mode === "completeBang" ? bangAnswered === 4 : bangAnswered === 0 || bangAnswered === 4);
  }
  const anyAnswer = Object.values(answers.value).some((v) => v != null);
  return anyAnswer || (props.kind === "medical_history" ? !!text.medical_history_other.trim() : !!text.skeletal_class);
});

function onSave() {
  if (props.mode === "completeBang") {
    emit("save", Object.fromEntries(BANG_QUESTIONS.map((q) => [q.key, answers.value[q.key]])));
    return;
  }
  const payload: Record<string, unknown> = { ...answers.value };
  if (props.kind === "medical_history") payload.medical_history_other = text.medical_history_other.trim() || null;
  if (props.kind === "oral_exam") {
    payload.skeletal_class = text.skeletal_class;
    payload.tooth = text.tooth.trim() || null;
  }
  emit("save", payload);
}
</script>

<style scoped>
.clinical-dialog__subtitle {
  margin: 0 0 8px;
  font-size: 0.8125rem;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.clinical-dialog__section {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 16px 0 4px;
}
.clinical-dialog__section:first-child {
  margin-top: 0;
}
.clinical-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}
.clinical-dialog__tooth {
  max-width: 120px;
}
.clinical-dialog__field {
  margin-top: 12px;
}
.clinical-dialog__other {
  margin: 12px 0 0;
}
.clinical-dialog__hint {
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.clinical-dialog__score {
  margin: 12px 0 0;
  font-weight: 600;
}
</style>
