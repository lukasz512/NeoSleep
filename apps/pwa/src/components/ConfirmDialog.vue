<template>
  <VDialog :model-value="modelValue" max-width="360" persistent @update:model-value="$emit('update:modelValue', $event)">
    <VCard>
      <VCardText>{{ message }}</VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="$emit('cancel')">
          {{ cancelLabel }}
        </VBtn>
        <VBtn :color="confirmColor" variant="text" @click="$emit('confirm')">
          {{ confirmLabel }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    confirmColor?: string;
  }>(),
  { confirmColor: "error" },
);

defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
  cancel: [];
}>();
</script>
