<template>
  <VMenu v-model="menuOpen" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: menuProps }">
      <VTextField
        v-bind="menuProps"
        :model-value="displayValue"
        :label="label"
        variant="outlined"
        density="comfortable"
        readonly
        :append-inner-icon="undefined"
      >
        <template #prepend-inner>
          <AppIcon name="calendar" />
        </template>
      </VTextField>
    </template>
    <VDatePicker
      :model-value="pickerValue"
      hide-header
      @update:model-value="onPick"
    />
  </VMenu>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppIcon from "./AppIcon.vue";

/**
 * Vuetify's own VDatePicker in a popover, replacing the native
 * <input type="date"> used elsewhere — browser-native date pickers render
 * inconsistently (format, affordance) across platforms; this matches the
 * rest of the app's design language instead.
 */
const props = defineProps<{
  modelValue: string | null; // ISO date string (yyyy-mm-dd), same shape the rest of the app already stores
  label: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

const menuOpen = ref(false);

const pickerValue = computed(() => (props.modelValue ? new Date(`${props.modelValue}T00:00:00`) : null));

const displayValue = computed(() => {
  if (!props.modelValue) return "";
  return new Date(`${props.modelValue}T00:00:00`).toLocaleDateString();
});

function onPick(value: unknown) {
  const date = Array.isArray(value) ? value[0] : value;
  if (date instanceof Date) {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    emit("update:modelValue", iso);
  }
  menuOpen.value = false;
}
</script>
