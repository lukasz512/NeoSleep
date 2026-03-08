import { ref, computed } from "vue";

const loadingCount = ref(0);

/**
 * Global loader state for API requests and other async operations.
 * Use startLoading() when a request starts and stopLoading() when it ends.
 * Multiple concurrent requests are supported (counter-based).
 */
export function useGlobalLoader() {
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
}
