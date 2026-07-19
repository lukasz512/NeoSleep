import { defineStore } from "pinia";
import { ref, computed } from "vue";

/**
 * Shared global loader store — single source of truth for "is the app
 * currently loading something" across apps/pwa (and any future app that
 * pulls in @neo/stores). Counter-based so concurrent callers (e.g. two
 * requests in flight at once) don't stomp on each other: the loader only
 * clears once every startLoading() has been matched by a stopLoading().
 */
export const useGlobalLoaderStore = defineStore("globalLoader", () => {
  const loadingCount = ref(0);

  const isLoading = computed(() => loadingCount.value > 0);

  function startLoading(): void {
    loadingCount.value += 1;
  }

  function stopLoading(): void {
    if (loadingCount.value > 0) {
      loadingCount.value -= 1;
    }
  }

  return {
    isLoading,
    startLoading,
    stopLoading,
  };
});
