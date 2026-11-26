<template>
  <div class="ahi-field">
    <NumberStepperField
      v-bind="$attrs"
      :model-value="modelValue"
      :label="label"
      :min="0"
      :max="150"
      :step="1"
      :start="0"
      :unit="t('app.patients.form.ahiUnit')"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <AhiScaleBar v-if="ahi !== null" :ahi="ahi" highlight class="ahi-field__scale" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import NumberStepperField from "./NumberStepperField.vue";
import AhiScaleBar from "./AhiScaleBar.vue";

/**
 * FormRenderer's 'ahi' field (NEO-228, NEO-241 stepper): the AHI in events/h
 * typed large between − and +, with the AASM severity scale under it the
 * moment there is a number and the current band named in its own color.
 * Every other outlined-input prop (rules, errors…) passes through.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{ modelValue?: unknown; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();
const { t } = useI18n();

const ahi = computed<number | null>(() => {
  if (props.modelValue === null || props.modelValue === undefined || props.modelValue === "") return null;
  const n = Number(props.modelValue);
  return Number.isFinite(n) && n >= 0 ? n : null;
});
</script>

<style scoped>
.ahi-field__scale {
  max-width: none;
  margin-top: 8px;
}
</style>
