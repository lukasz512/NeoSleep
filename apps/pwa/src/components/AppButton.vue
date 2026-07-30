<template>
  <VBtn :loading="loading" :disabled="isDisabled">
    <template #loader>
      <AppSpinner size="20" width="2" color="currentColor" />
    </template>
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
 *
 * `ignoreGlobalLoading` opts a specific button out of that second half —
 * for something like a "clear search" / "clear filters" button, which
 * itself triggers the very apiFetch that would otherwise disable it
 * (typing debounces into a reload, which sets globalLoader.isLoading,
 * which would then block the button meant to cancel/reset that same
 * search). Its own `loading` prop still works normally either way.
 *
 * The #loader override routes the in-flight spinner through AppSpinner
 * too, so it's not a separate Vuetify-internal spinner left out of the
 * "change every spinner in one place" component.
 */
import { computed } from "vue";
import { VBtn } from "vuetify/components";
import { useGlobalLoaderStore } from "@stores";
import AppSpinner from "./AppSpinner.vue";

const props = withDefaults(
  defineProps<{
    loading?: boolean;
    disabled?: boolean;
    ignoreGlobalLoading?: boolean;
  }>(),
  { loading: false, disabled: false, ignoreGlobalLoading: false },
);

const globalLoader = useGlobalLoaderStore();

const isDisabled = computed(
  () => props.disabled || props.loading || (!props.ignoreGlobalLoading && globalLoader.isLoading),
);
</script>
