<template>
  <VTextField
    ref="fieldRef"
    :model-value="modelValue"
    type="email"
    autocomplete="email"
    :label="label"
    :placeholder="placeholder"
    :hint="hint"
    :persistent-hint="persistentHint"
    :rules="rules"
    :variant="variant"
    :density="density"
    @update:model-value="onInput"
  >
    <template #prepend-inner>
      <button type="button" class="pwa-email-at-btn" :aria-label="t('app.identity.form.emailInsertAt')" @mousedown.prevent="insertAtSign">
        <AppIcon name="at" class="pwa-form-field-icon" />
      </button>
    </template>
  </VTextField>
</template>

<script setup lang="ts">
/**
 * The one email input used across the whole PWA — 'at' icon with the
 * insert-@ helper button (mousedown.prevent so the button never steals
 * focus from the input first), plus whatever format rule the caller passes
 * in via `rules`. Was previously FormRenderer-only machinery
 * (insertAtSign()); extracted so bespoke, non-FormRenderer forms (e.g.
 * OrthoApneaOrderWizard's alternative-address sub-form) get the same input,
 * not a plain VTextField. FormRenderer itself now renders this too (see
 * componentFor("email")) instead of its own inline prepend-inner branch —
 * one email input, not two copies of the same button.
 */
import { ref, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    label?: string;
    placeholder?: string;
    hint?: string;
    persistentHint?: boolean;
    rules?: ((v: unknown) => true | string)[];
    variant?: string;
    density?: string;
  }>(),
  { modelValue: "" }
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const { t } = useI18n();

function onInput(v: string) {
  emit("update:modelValue", v);
}

const fieldRef = ref<{ $el?: HTMLElement } | null>(null);

/** A no-op once "@" is already present (an email has at most one). */
function insertAtSign() {
  const current = props.modelValue ?? "";
  if (current.includes("@")) return;
  const inputEl = fieldRef.value?.$el?.querySelector("input") ?? undefined;
  const start = inputEl?.selectionStart ?? current.length;
  const end = inputEl?.selectionEnd ?? current.length;
  emit("update:modelValue", current.slice(0, start) + "@" + current.slice(end));
  nextTick(() => {
    inputEl?.focus();
    // type="email" doesn't support the selection API — setSelectionRange
    // throws InvalidStateError there, so re-placing the caret is best-effort.
    try {
      inputEl?.setSelectionRange(start + 1, start + 1);
    } catch {
      // no-op: unsupported input type, focus() above is enough
    }
  });
}
</script>
