<template>
  <VInput
    :model-value="modelValue"
    :rules="rules"
    :disabled="disabled"
    hide-details="auto"
    class="choice-chips-field"
  >
    <div class="choice-chips-field__body" role="radiogroup" :aria-label="label">
      <div class="choice-chips-field__label">{{ label }}</div>
      <div class="choice-chips-field__chips">
        <button
          v-for="o in primary"
          :key="String(o.value)"
          type="button"
          role="radio"
          :aria-checked="o.value === modelValue"
          :disabled="disabled"
          class="choice-chips-field__chip"
          :class="{ 'is-selected': o.value === modelValue }"
          @click="emit('update:modelValue', o.value)"
        >
          <span v-if="o.symbol" class="choice-chips-field__symbol" aria-hidden="true">{{ o.symbol }}</span>
          {{ o.title }}
        </button>
      </div>
      <div v-if="secondary.length" class="choice-chips-field__more">
        <span>{{ t("app.formRenderer.choiceMore") }}</span>
        <template v-for="(o, i) in secondary" :key="String(o.value)">
          <span v-if="i > 0" aria-hidden="true">·</span>
          <button
            type="button"
            role="radio"
            :aria-checked="o.value === modelValue"
            :disabled="disabled"
            class="choice-chips-field__link"
            :class="{ 'is-selected': o.value === modelValue }"
            @click="emit('update:modelValue', o.value)"
          >
            {{ o.title }}
          </button>
        </template>
      </div>
    </div>
  </VInput>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { FormFieldOption } from "../types/formField";

/**
 * FormRenderer's 'choice' field: the common options as large tappable chips
 * (with an optional symbol), the rare ones (`secondary: true`) as small links
 * underneath — one tap for the usual answer, no dropdown to open. Wrapped in
 * VInput so `rules` (e.g. required) validate with the rest of the VForm.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    label: string;
    items: FormFieldOption[];
    rules?: ((v: unknown) => true | string)[];
    disabled?: boolean;
  }>(),
  { modelValue: null, rules: () => [], disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const { t } = useI18n();

const primary = computed(() => props.items.filter((o) => !o.secondary));
const secondary = computed(() => props.items.filter((o) => o.secondary));
</script>

<style scoped>
.choice-chips-field__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.choice-chips-field__label {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.choice-chips-field__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.choice-chips-field__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
  border: 1.5px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 999px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.9375rem;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.choice-chips-field__chip.is-selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.choice-chips-field__symbol {
  font-size: 1.25rem;
  line-height: 1;
}

.choice-chips-field__more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.choice-chips-field__link {
  padding: 2px 4px;
  border-radius: 6px;
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
  cursor: pointer;
}

.choice-chips-field__link.is-selected {
  padding: 2px 10px;
  background: rgba(var(--v-theme-primary), 0.14);
  font-weight: 600;
  text-decoration: none;
}

.choice-chips-field__chip:focus-visible,
.choice-chips-field__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.choice-chips-field__chip:disabled,
.choice-chips-field__link:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
