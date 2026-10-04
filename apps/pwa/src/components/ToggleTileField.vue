<template>
  <button
    type="button"
    role="switch"
    :aria-checked="on"
    :disabled="disabled"
    class="toggle-tile"
    :class="{ 'is-on': on }"
    @click="emit('update:modelValue', on ? falseValue : trueValue)"
  >
    <span class="toggle-tile__icon">
      <AppIcon v-if="icon" :name="icon" />
    </span>
    <span class="toggle-tile__text">
      <span class="toggle-tile__label">{{ label }}</span>
      <span class="toggle-tile__state">{{ on ? onText : offText }}</span>
    </span>
    <span class="toggle-tile__check" aria-hidden="true">
      <AppIcon name="check" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "./AppIcon.vue";

type IconName = InstanceType<typeof AppIcon>["$props"]["name"];

/**
 * FormRenderer's 'toggle' field (NEO-241): one quiet tile that is off by
 * default and lights up when tapped, e.g. "Uses CPAP". Off is the normal
 * state, so it isn't drawn as a crossed-out choice of its own.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    label: string;
    icon?: IconName;
    onText: string;
    offText: string;
    trueValue?: unknown;
    falseValue?: unknown;
    disabled?: boolean;
  }>(),
  { modelValue: null, icon: undefined, trueValue: true, falseValue: false, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const on = computed(() => props.modelValue === props.trueValue);
</script>

<style scoped>
.toggle-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: var(--pwa-radius, 10px);
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.toggle-tile:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.toggle-tile.is-on {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.toggle-tile:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.toggle-tile:disabled {
  cursor: default;
  opacity: 0.6;
}

.toggle-tile__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  transition: background-color 0.15s ease, color 0.15s ease;
}

.toggle-tile__icon :deep(svg) {
  width: 24px;
  height: 24px;
}

.is-on .toggle-tile__icon {
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
}

.toggle-tile__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.toggle-tile__label {
  font-size: 1rem;
}

.toggle-tile__state {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.is-on .toggle-tile__state {
  color: rgb(var(--v-theme-primary));
}

.toggle-tile__check {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.3);
  border-radius: 50%;
  color: transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.toggle-tile__check :deep(svg) {
  width: 14px;
  height: 14px;
}

.is-on .toggle-tile__check {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

@media (prefers-reduced-motion: reduce) {
  .toggle-tile,
  .toggle-tile__icon,
  .toggle-tile__check {
    transition: none;
  }
}
</style>
