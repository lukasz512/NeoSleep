<template>
  <div class="questionnaire-checklist" :class="{ 'questionnaire-checklist--large': large }">
    <div
      v-for="question in questions"
      :key="question.key"
      class="questionnaire-checklist__row"
      :class="{ 'questionnaire-checklist__row--missing': highlightUnanswered && modelValue[question.key] == null }"
    >
      <span :id="`q-${question.key}`" class="questionnaire-checklist__label">{{ t(question.labelKey) }}</span>
      <span v-if="readonly" class="questionnaire-checklist__answer">{{ answerText(modelValue[question.key]) }}</span>
      <VBtnToggle
        v-else
        :model-value="modelValue[question.key]"
        :aria-labelledby="`q-${question.key}`"
        density="comfortable"
        color="primary"
        divided
        @update:model-value="(value: boolean | null) => answer(question.key, value)"
      >
        <VBtn :value="true" :size="large ? 'large' : 'small'">{{ t("app.common.yes") }}</VBtn>
        <VBtn :value="false" :size="large ? 'large' : 'small'">{{ t("app.common.no") }}</VBtn>
      </VBtnToggle>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import type { QuestionDef } from "../../config/questionnaires";

/**
 * Yes/No checklist — one row per question, answers keyed by question key
 * (true / false / null = not answered). Shared by the staff questionnaire
 * dialog and the patient self-fill page (`large` = bigger touch targets
 * for a phone held by a patient). Replaces the VBtnToggle markup that was
 * copied three times across the 026 endo/STOP-Bang panels.
 */
const props = defineProps<{
  questions: QuestionDef[];
  modelValue: Record<string, boolean | null>;
  readonly?: boolean;
  large?: boolean;
  highlightUnanswered?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Record<string, boolean | null>] }>();
const { t } = useI18n();

// Built on a local copy, not on props.modelValue directly: two answers given
// before the parent re-renders (fast taps, autofill) would otherwise both
// spread the same stale prop and the second would silently drop the first.
let current: Record<string, boolean | null> = { ...props.modelValue };
watch(
  () => props.modelValue,
  (value) => {
    current = { ...value };
  }
);

function answer(key: string, value: boolean | null) {
  current = { ...current, [key]: value ?? null };
  emit("update:modelValue", current);
}

function answerText(value: boolean | null | undefined): string {
  if (value === true) return t("app.common.yes");
  if (value === false) return t("app.common.no");
  return "—";
}
</script>

<style scoped>
.questionnaire-checklist__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}
.questionnaire-checklist--large .questionnaire-checklist__row {
  padding: 12px 0;
  font-size: 1.0625rem;
}
.questionnaire-checklist__row--missing .questionnaire-checklist__label {
  color: rgb(var(--v-theme-error));
}
.questionnaire-checklist__label {
  flex: 1;
}
.questionnaire-checklist__answer {
  font-weight: 600;
}
</style>
