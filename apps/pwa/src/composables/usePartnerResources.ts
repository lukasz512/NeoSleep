import { ref, computed } from "vue";
import { apiFetch } from "./useApi";

/**
 * OrthoApnea resources (documents/videos) — ADR-015 discussion. Module-level
 * shared state, same pattern as useNotificationCenter.ts, so a preload
 * triggered from useAppReady.ts and a later visit to ResourcesView.vue share
 * one cache instead of double-fetching.
 */
export interface PartnerResourceItem {
  id: string;
  partner: string;
  kind: "document" | "video";
  title: string;
  description: string;
  mediaUrl: string;
  category: number;
  weight: number;
}

const items = ref<PartnerResourceItem[]>([]);
const loading = ref(false);
const loadError = ref(false);
const loadedForLocale = ref<string | null>(null);

const documents = computed(() => items.value.filter((r) => r.kind === "document"));
const videos = computed(() => items.value.filter((r) => r.kind === "video"));

/** Re-fetches only if not already loaded for this locale — safe to call repeatedly (preload + view mount). */
async function load(locale: string): Promise<void> {
  if (loadedForLocale.value === locale && !loadError.value) return;

  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(`/api/v1/partners/orthoapnea/resources?locale=${locale}`, { handleErrors: false });
    if (!res.ok) {
      loadError.value = true;
      return;
    }
    const data = (await res.json()) as { resources: PartnerResourceItem[] };
    items.value = data.resources;
    loadedForLocale.value = locale;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

export function usePartnerResources() {
  return { items, documents, videos, loading, loadError, load };
}
