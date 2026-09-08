<template>
  <VDialog
    :model-value="modelValue"
    :max-width="maxWidth"
    class="pwa-discard-dialog"
    :transition="originDialogTransition"
    persistent
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <VCard class="pwa-confirm-dialog__card">
      <VCardTitle v-if="title">{{ title }}</VCardTitle>
      <VCardText>{{ text }}</VCardText>
      <VCardActions>
        <VSpacer />
        <AppButton variant="text" :color="secondaryColor" @click="emit('secondary')">{{ secondaryLabel }}</AppButton>
        <AppButton :color="primaryColor" :loading="loading" @click="emit('primary')">{{ primaryLabel }}</AppButton>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
/**
 * The one small "two-option" confirm dialog used across the whole PWA
 * (discard changes, save-as-draft-or-discard, etc.) — reuses the same
 * .pwa-confirm-dialog__card / .pwa-discard-dialog tonal styling every other
 * nested confirm dialog already used (see FormRenderer.vue/EventForm.vue's
 * discard-confirm), so a bespoke dialog (like OrthoApneaOrderWizard's
 * save-draft prompt) doesn't drift into its own ad-hoc padding/styling.
 *
 * "Secondary" is the left/text-styled button (often destructive — Discard,
 * Cancel), "primary" is the right/filled button (often the safe default —
 * Save, Confirm). Neither name is hardcoded to a specific meaning since
 * different callers use this both ways (compare FormRenderer's
 * Cancel/Discard vs. the order wizard's Discard/Save draft).
 */
import { originDialogTransition } from "@ui";
import AppButton from "./AppButton.vue";

withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    text: string;
    secondaryLabel: string;
    primaryLabel: string;
    secondaryColor?: string;
    primaryColor?: string;
    loading?: boolean;
    maxWidth?: number | string;
  }>(),
  {
    title: undefined,
    secondaryColor: "error",
    primaryColor: "primary",
    loading: false,
    maxWidth: 380,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  secondary: [];
  primary: [];
}>();
</script>
