<template>
  <div class="number-stepper-field">
    <AppButton
      icon
      size="large"
      variant="tonal"
      color="primary"
      class="number-stepper-field__btn"
      :disabled="disabled"
      :aria-label="t('app.orthoApneaOrder.form.decrementValue')"
      @click="adjust(-1)"
    >
      <AppIcon name="minus" />
    </AppButton>
    <VTextField
      :model-value="modelValue"
      type="number"
      variant="outlined"
      color="primary"
      density="comfortable"
      hide-details
      :disabled="disabled"
      class="number-stepper-field__input"
      @update:model-value="onInput"
    />
    <AppButton
      icon
      size="large"
      variant="tonal"
      color="primary"
      class="number-stepper-field__btn"
      :disabled="disabled"
      :aria-label="t('app.orthoApneaOrder.form.incrementValue')"
      @click="adjust(1)"
    >
      <AppIcon name="plus" />
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";

/**
 * Numeric input with large +/- buttons flanking it — OrthoApnea's wizard has
 * many small millimeter/percent measurements (MR, MP, deviation, starting
 * point, sequence steps, laterality, opening limitation) that reps adjust in
 * small increments; a plain number field's tiny native spinner made that
 * fiddly, so this replaces it everywhere in the wizard.
 */
const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    step?: number;
    disabled?: boolean;
  }>(),
  { step: 1, disabled: false }
);

const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();

const { t } = useI18n();

function onInput(value: string) {
  emit("update:modelValue", value === "" ? null : Number(value));
}

function adjust(direction: 1 | -1) {
  const current = props.modelValue ?? 0;
  emit("update:modelValue", current + direction * props.step);
}
</script>

<style scoped>
.number-stepper-field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.number-stepper-field__input {
  flex: 1;
  min-width: 56px;
}

.number-stepper-field__input :deep(input) {
  text-align: center;
}

.number-stepper-field__btn {
  flex-shrink: 0;
}
</style>
