<template>
  <VBtnToggle
    :model-value="modelValue"
    :aria-labelledby="labelledby"
    density="comfortable"
    color="primary"
    divided
    class="yes-no-toggle"
    @update:model-value="(value: boolean | null | undefined) => emit('update:modelValue', value ?? null)"
  >
    <VBtn :value="true" :size="large ? 'large' : 'small'">{{ t("app.common.yes") }}</VBtn>
    <VBtn :value="false" :size="large ? 'large' : 'small'">{{ t("app.common.no") }}</VBtn>
  </VBtnToggle>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

/** The one Sí / No control of the clinical forms — same look in every questionnaire (shared form grammar, 2026-09-26). */
defineProps<{
  modelValue: boolean | null | undefined;
  labelledby?: string;
  large?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: boolean | null] }>();
const { t } = useI18n();
</script>

<style scoped>
.yes-no-toggle {
  flex: none;
}
</style>
