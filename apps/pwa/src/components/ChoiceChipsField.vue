<template>
  <VInput
    :model-value="modelValue"
    :rules="rules"
    :disabled="disabled"
    hide-details="auto"
    class="choice-chips-field"
  >
    <div
      class="choice-chips-field__row"
      :class="{ 'has-secondary-value': selectedSecondary }"
      role="radiogroup"
      :aria-label="label"
    >
      <button
        v-for="o in primary"
        :key="String(o.value)"
        type="button"
        role="radio"
        :aria-checked="o.value === modelValue"
        :aria-label="o.title"
        :title="o.title"
        :disabled="disabled"
        class="choice-chips-field__chip"
        :class="{ 'is-selected': o.value === modelValue }"
        @click="emit('update:modelValue', o.value)"
      >
        <span v-if="o.symbol" class="choice-chips-field__symbol" aria-hidden="true">{{ o.symbol }}</span>
        <span class="choice-chips-field__text">{{ o.title }}</span>
      </button>

      <VMenu v-if="secondary.length" location="bottom end">
        <template #activator="{ props: menuProps }">
          <button
            v-if="selectedSecondary"
            v-bind="menuProps"
            type="button"
            role="radio"
            aria-checked="true"
            :disabled="disabled"
            class="choice-chips-field__chip is-selected choice-chips-field__secondary-value"
          >
            <span v-if="selectedSecondary.symbol" class="choice-chips-field__symbol" aria-hidden="true">{{ selectedSecondary.symbol }}</span>
            <span class="choice-chips-field__text">{{ selectedSecondary.title }}</span>
            <AppIcon name="chevron-down" class="choice-chips-field__chevron" />
          </button>
          <button
            v-else
            v-bind="menuProps"
            type="button"
            :aria-label="t('app.formRenderer.choiceMore')"
            :title="t('app.formRenderer.choiceMore')"
            :disabled="disabled"
            class="choice-chips-field__more"
          >
            <AppIcon name="dots-vertical" />
          </button>
        </template>
        <VList density="compact" class="choice-chips-field__menu">
          <VListItem
            v-for="o in secondary"
            :key="String(o.value)"
            :title="o.title"
            :active="o.value === modelValue"
            color="primary"
            @click="emit('update:modelValue', o.value)"
          />
        </VList>
      </VMenu>
    </div>
  </VInput>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import type { FormFieldOption } from "../types/formField";

/**
 * FormRenderer's 'choice' field, one row the height of an outlined input:
 * the common options as tappable chips (with an optional symbol), the rare
 * ones (`secondary: true`) behind a "more" button. Once a secondary option
 * is picked the common chips shrink to their symbol and the pick takes their
 * room, so the row never wraps. No visible label — the options name
 * themselves; the label stays as the radiogroup's accessible name. Wrapped
 * in VInput so `rules` (e.g. required) validate with the rest of the VForm.
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
const selectedSecondary = computed(() => secondary.value.find((o) => o.value === props.modelValue));
</script>

<style scoped>
.choice-chips-field__row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 48px;
}

.choice-chips-field__chip {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 48px;
  padding: 0 12px;
  border: 1.5px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 999px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.9375rem;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, flex-basis 0.2s ease;
}

.choice-chips-field__chip.is-selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.choice-chips-field__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* A secondary pick is showing — the common chips give up their room and keep only the symbol. */
.has-secondary-value .choice-chips-field__chip:not(.choice-chips-field__secondary-value) {
  flex: 0 0 48px;
  padding: 0;
}

.has-secondary-value .choice-chips-field__chip:not(.choice-chips-field__secondary-value) .choice-chips-field__text {
  display: none;
}

.choice-chips-field__symbol {
  font-size: 1.25rem;
  line-height: 1;
}

.choice-chips-field__chevron {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
}

/* Quiet on purpose: the rare options shouldn't compete with the two chips for room or attention. */
.choice-chips-field__more {
  display: inline-flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  height: 48px;
  border-radius: 999px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
}

.choice-chips-field__more:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.choice-chips-field__chip:focus-visible,
.choice-chips-field__more:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.choice-chips-field__chip:disabled,
.choice-chips-field__more:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
