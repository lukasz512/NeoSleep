import { ref } from "vue";

/**
 * Wraps an async click handler with its own `loading` ref, so binding it to a
 * single AppButton's `:loading` prop shows the spinner on just that button —
 * not on every button app-wide the way the global loader store's auto-disable
 * does (see AppButton.vue's isDisabled). Guards against re-entrant clicks
 * while the previous call is still in flight.
 */
export function useAsyncAction<Args extends unknown[]>(action: (...args: Args) => Promise<void>) {
  const loading = ref(false);

  async function run(...args: Args): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      await action(...args);
    } finally {
      loading.value = false;
    }
  }

  return { loading, run };
}
