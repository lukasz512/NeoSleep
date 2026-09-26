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
        <!-- One element for both "more" and the picked secondary option, so the switch
             between them animates its width instead of swapping boxes. -->
        <template #activator="{ props: menuProps }">
          <button
            v-bind="menuProps"
            type="button"
            :role="selectedSecondary ? 'radio' : undefined"
            :aria-checked="selectedSecondary ? 'true' : undefined"
            :aria-label="selectedSecondary ? undefined : t('app.formRenderer.choiceMore')"
            :title="selectedSecondary ? undefined : t('app.formRenderer.choiceMore')"
            :disabled="disabled"
            class="choice-chips-field__more"
            :class="{ 'is-selected': selectedSecondary }"
          >
            <template v-if="selectedSecondary">
              <span class="choice-chips-field__text">{{ selectedSecondary.title }}</span>
              <AppIcon name="chevron-down" class="choice-chips-field__chevron" />
            </template>
            <AppIcon v-else name="dots-vertical" />
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
 * FormRenderer's 'choice' field, one segmented row looking like an outlined
 * input: the common options as segments (with an optional symbol), the rare
 * ones (`secondary: true`) behind a "more" segment. Once a secondary option
 * is picked the common segments shrink to their symbol and the pick takes
 * their room, so the row never wraps. No visible label — the options name
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
/*
 * Styled as one outlined input split into segments — same height, border and
 * radius as the text fields around it — so it reads as an ordinary form
 * question, not a call to action. The pick gets a light primary tint only.
 */
.choice-chips-field__row {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 48px;
  overflow: hidden;
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: var(--pwa-radius, 10px);
}

.choice-chips-field.v-input--error .choice-chips-field__row {
  border-color: rgb(var(--v-theme-error));
}

/*
 * Segment widths never depend on their text or on which one is picked
 * (equal flex-basis 0, same font weight selected or not), so the dividers
 * stay put while clicking. The only width change is the deliberate one —
 * a secondary pick (Otro…) taking the room — and that one is animated.
 */
.choice-chips-field__chip,
.choice-chips-field__more {
  --choice-motion: var(--pwa-transition-duration, 280ms) var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1rem;
  white-space: nowrap;
  cursor: pointer;
  transition:
    flex-grow var(--choice-motion),
    flex-basis var(--choice-motion),
    padding var(--choice-motion),
    background-color 0.15s ease,
    color 0.15s ease;
}

.choice-chips-field__chip {
  flex: 1 1 0;
  padding: 0 10px;
}

.choice-chips-field__chip + .choice-chips-field__chip,
.choice-chips-field__chip + .choice-chips-field__more {
  border-left: 1px solid rgba(var(--v-theme-outline), 0.6);
}

.choice-chips-field__chip:hover,
.choice-chips-field__more:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.choice-chips-field__chip.is-selected,
.choice-chips-field__more.is-selected {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.choice-chips-field__text {
  max-width: 14em;
  margin-left: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: max-width var(--choice-motion), margin var(--choice-motion), opacity 0.2s ease;
}

.choice-chips-field__more .choice-chips-field__text {
  margin-left: 0;
}

.choice-chips-field__symbol {
  font-size: 1.125rem;
  line-height: 1;
  opacity: 0.7;
}

.choice-chips-field__chip.is-selected .choice-chips-field__symbol {
  opacity: 1;
}

/* A secondary pick is showing — the common segments slide down to just their symbol. */
.has-secondary-value .choice-chips-field__chip {
  flex: 0 0 44px;
  padding: 0;
}

.has-secondary-value .choice-chips-field__chip .choice-chips-field__text {
  max-width: 0;
  margin-left: 0;
  opacity: 0;
}

.choice-chips-field__chevron {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-left: 4px;
}

.choice-chips-field__more {
  flex: 0 0 40px;
  padding: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* …and the "more" segment grows into the room they gave up, showing the pick. */
.choice-chips-field__more.is-selected {
  flex: 1 1 0;
  padding: 0 10px;
}

@media (prefers-reduced-motion: reduce) {
  .choice-chips-field__chip,
  .choice-chips-field__more,
  .choice-chips-field__text {
    transition: none;
  }
}

.choice-chips-field__chip:focus-visible,
.choice-chips-field__more:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.choice-chips-field__chip:disabled,
.choice-chips-field__more:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
