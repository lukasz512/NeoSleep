import { computed, ref, watch } from "vue";
import { apiFetch } from "./useApi";

export const SEARCH_DEBOUNCE_MS = 200;
export const SEARCH_MIN_CHARS = 2;

export interface SearchHit {
  id: string;
  label: string;
  sublabel: string;
  region: string;
}

export interface SearchGroups {
  patients: SearchHit[];
  practitioners: SearchHit[];
  organizations: SearchHit[];
}

export type SearchStatus = "idle" | "loading" | "ok" | "rate_limited" | "error";

/**
 * Debounced record search for the palette (CORE-292). The term goes in the POST body so it never
 * lands in a URL or access log; a newer keystroke aborts the older request and a late answer is dropped.
 */
export function useGlobalSearch() {
  const term = ref("");
  const groups = ref<SearchGroups | null>(null);
  const status = ref<SearchStatus>("idle");

  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const total = computed(() =>
    groups.value ? groups.value.patients.length + groups.value.practitioners.length + groups.value.organizations.length : 0
  );

  function cancel(): void {
    clearTimeout(timer);
    controller?.abort();
    controller = undefined;
  }

  async function run(text: string): Promise<void> {
    const mine = new AbortController();
    controller = mine;
    status.value = "loading";
    try {
      const res = await apiFetch("/api/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: text }),
        signal: mine.signal,
        handleErrors: false,
      });
      if (mine.signal.aborted) return;
      if (res.status === 429) {
        status.value = "rate_limited";
        return;
      }
      if (!res.ok) {
        status.value = "error";
        return;
      }
      groups.value = (await res.json()) as SearchGroups;
      if (mine.signal.aborted) return;
      status.value = "ok";
    } catch {
      if (!mine.signal.aborted) status.value = "error";
    }
  }

  watch(term, (value) => {
    cancel();
    const text = value.trim();
    if (text.length < SEARCH_MIN_CHARS) {
      groups.value = null;
      status.value = "idle";
      return;
    }
    timer = setTimeout(() => void run(text), SEARCH_DEBOUNCE_MS);
  });

  function clear(): void {
    cancel();
    term.value = "";
    groups.value = null;
    status.value = "idle";
  }

  return { term, groups, status, total, clear };
}
