<template>
  <VDialog
    :model-value="modelValue"
    :max-width="maxWidth"
    scrollable
    class="pwa-discard-dialog"
    content-class="pwa-form-dialog__content"
    :transition="originDialogTransition"
    :persistent="persistent"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <VCard class="pwa-confirm-dialog__card" data-testid="app-confirm-dialog">
      <AppDialogHeader v-if="title" :title="title" :closable="false" />
      <VCardText>{{ text }}</VCardText>
      <VCardActions>
        <VSpacer />
        <AppButton variant="text" :color="secondaryColor ?? undefined" @click="emit('secondary')">{{ secondaryLabel }}</AppButton>
        <AppButton :color="primaryColor" :variant="primaryVariant" :loading="loading" @click="emit('primary')">{{ primaryLabel }}</AppButton>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
/**
 * The one small "two-option" confirm dialog used across the whole PWA
 * (discard changes, delete record, save-as-draft-or-discard, etc.). Shares
 * the dialog box model with AppFormDialog.vue (.pwa-confirm-dialog__card in
 * theme.scss), and its `.pwa-discard-dialog` class keeps it above a parent
 * form dialog and the mobile bottom nav. Raw <VDialog> confirms are blocked
 * by AppFormDialog.spec.ts — use this instead.
 *
 * "Secondary" is the left/text-styled button, "primary" the right one.
 * Neither name is hardcoded to a meaning since callers use it both ways
 * (Cancel/Delete on a delete confirm, Discard/Save draft on the order
 * wizard). `secondaryColor: null` gives a neutral Cancel; `primaryVariant:
 * "text"` keeps a destructive action as a quiet text button.
 */
import { originDialogTransition } from "@ui";
import type { VBtn } from "vuetify/components";
import AppButton from "./AppButton.vue";
import AppDialogHeader from "./AppDialogHeader.vue";

type BtnVariant = VBtn["$props"]["variant"];

withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    text: string;
    secondaryLabel: string;
    primaryLabel: string;
    secondaryColor?: string | null;
    primaryColor?: string;
    primaryVariant?: BtnVariant;
    loading?: boolean;
    persistent?: boolean;
    maxWidth?: number | string;
  }>(),
  {
    title: undefined,
    secondaryColor: "error",
    primaryColor: "primary",
    primaryVariant: undefined,
    loading: false,
    persistent: true,
    maxWidth: 380,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  secondary: [];
  primary: [];
}>();
</script>
