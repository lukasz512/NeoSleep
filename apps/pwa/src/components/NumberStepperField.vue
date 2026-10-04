<template>
  <VTextField
    v-bind="$attrs"
    :model-value="modelValue"
    :label="label"
    :disabled="disabled"
    type="number"
    inputmode="decimal"
    :min="min"
    :max="max"
    :step="step"
    :suffix="unit"
    class="number-stepper"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #prepend-inner>
      <button
        type="button"
        class="number-stepper__btn"
        :aria-label="t('app.formRenderer.stepDown')"
        :disabled="disabled || atMin"
        @pointerdown="startHold(-1, $event)"
        @click="onClick(-1, $event)"
      >
        <AppIcon name="minus" />
      </button>
    </template>
    <template #append-inner>
      <button
        type="button"
        class="number-stepper__btn"
        :aria-label="t('app.formRenderer.stepUp')"
        :disabled="disabled || atMax"
        @pointerdown="startHold(1, $event)"
        @click="onClick(1, $event)"
      >
        <AppIcon name="plus" />
      </button>
    </template>
  </VTextField>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";

/**
 * A number typed large in the middle with − and + either side (NEO-241), for
 * short clinical values like the AHI or a height. Typing still works; a press
 * moves one `step`, holding the button keeps counting. The first press on an
 * empty field lands on `start`. Every other outlined-input prop passes through.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    label?: string;
    min: number;
    max: number;
    step?: number;
    start: number;
    unit?: string;
    disabled?: boolean;
  }>(),
  { modelValue: null, label: undefined, step: 1, unit: undefined, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();
const { t } = useI18n();

const current = computed<number | null>(() => {
  if (props.modelValue === null || props.modelValue === undefined || props.modelValue === "") return null;
  const n = Number(props.modelValue);
  return Number.isFinite(n) ? n : null;
});
const atMin = computed(() => current.value !== null && current.value <= props.min);
const atMax = computed(() => current.value !== null && current.value >= props.max);

/** The value one step away, clamped, rounded to the step so 0.1-steps don't drift. */
function stepped(dir: 1 | -1): number {
  if (current.value === null) return props.start;
  const decimals = (String(props.step).split(".")[1] ?? "").length;
  const next = Number((current.value + dir * props.step).toFixed(decimals));
  return Math.min(props.max, Math.max(props.min, next));
}

function bump(dir: 1 | -1) {
  if (props.disabled) return;
  emit("update:modelValue", stepped(dir));
}

let holdTimer: ReturnType<typeof setTimeout> | undefined;
let repeatTimer: ReturnType<typeof setInterval> | undefined;
function stopHold() {
  clearTimeout(holdTimer);
  clearInterval(repeatTimer);
  window.removeEventListener("pointerup", stopHold);
  window.removeEventListener("pointercancel", stopHold);
}

/** Pointer press: one step now, then keep stepping while held. */
function startHold(dir: 1 | -1, e: PointerEvent) {
  if (e.button > 0) return;
  e.preventDefault();
  bump(dir);
  stopHold();
  holdTimer = setTimeout(() => {
    repeatTimer = setInterval(() => bump(dir), 80);
  }, 400);
  window.addEventListener("pointerup", stopHold);
  window.addEventListener("pointercancel", stopHold);
}

/** Keyboard activation (Enter/Space) arrives as a click with detail 0; a pointer press already stepped. */
function onClick(dir: 1 | -1, e: MouseEvent) {
  if (e.detail === 0) bump(dir);
}

onBeforeUnmount(stopHold);
</script>

<style scoped>
.number-stepper :deep(input) {
  text-align: center;
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}

.number-stepper :deep(input::-webkit-outer-spin-button),
.number-stepper :deep(input::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

.number-stepper :deep(.v-text-field__suffix) {
  align-self: center;
  padding-left: 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.number-stepper__btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

.number-stepper__btn :deep(svg) {
  width: 18px;
  height: 18px;
}

.number-stepper__btn:hover {
  background: rgba(var(--v-theme-primary), 0.18);
}

.number-stepper__btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.number-stepper__btn:disabled {
  cursor: default;
  opacity: 0.35;
}
</style>
