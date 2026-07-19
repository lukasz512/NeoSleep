<template>
  <VBtn :loading="loading" :disabled="isDisabled">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </VBtn>
</template>

<script setup lang="ts">
/**
 * Single button used app-wide instead of raw <VBtn> — flat styling and
 * hover behavior come from the global `.v-btn` rules in assets/theme.scss,
 * so nothing needs to be repeated per call site. All other VBtn props
 * (variant, color, icon, size, ...) and slots pass through untouched.
 *
 * Disabled state is automatic: this button disables itself while its own
 * `loading` is true, and while ANY apiFetch request is in flight elsewhere
 * (useGlobalLoaderStore) — so a Cancel button next to a submitting form
 * doesn't need its own `:disabled` wiring.
 */
import { computed } from "vue";
import { VBtn } from "vuetify/components";
import { useGlobalLoaderStore } from "@stores";

const props = withDefaults(
  defineProps<{
    loading?: boolean;
    disabled?: boolean;
  }>(),
  { loading: false, disabled: false },
);

const globalLoader = useGlobalLoaderStore();

const isDisabled = computed(() => props.disabled || props.loading || globalLoader.isLoading);
</script>
