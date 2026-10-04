<template>
  <div class="ahi-field">
    <VTextField
      v-bind="$attrs"
      :model-value="modelValue"
      type="number"
      inputmode="decimal"
      min="0"
      :suffix="t('app.patients.form.ahiUnit')"
      class="ahi-field__input"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #prepend-inner>
        <AppIcon name="nav-sleep-studies" class="pwa-form-field-icon" />
      </template>
    </VTextField>
    <AhiScaleBar v-if="ahi !== null" :ahi="ahi" highlight class="ahi-field__scale" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import AhiScaleBar from "./AhiScaleBar.vue";

/**
 * FormRenderer's 'ahi' field (NEO-228): the AHI in events/h, typed large,
 * with the AASM severity scale under it the moment there is a number — the
 * doctor sees "moderate" while typing, same scale as the PSG result on Estudios.
 * Every other outlined-input prop (label, rules, errors…) passes through.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{ modelValue?: unknown }>();
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();
const { t } = useI18n();

const ahi = computed<number | null>(() => {
  if (props.modelValue === null || props.modelValue === undefined || props.modelValue === "") return null;
  const n = Number(props.modelValue);
  return Number.isFinite(n) && n >= 0 ? n : null;
});
</script>

<style scoped>
.ahi-field__input :deep(input) {
  font-size: 1.375rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ahi-field__scale {
  max-width: none;
  margin-top: 4px;
}
</style>
