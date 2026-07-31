import { ref, computed } from "vue";
import { apiFetch } from "./useApi";

/**
 * OrthoApnea resources (documents/videos) — ADR-015 discussion. Module-level
 * shared state, same pattern as useNotificationCenter.ts, so a preload
 * triggered from useAppReady.ts and a later visit to ResourcesView.vue share
 * one cache instead of double-fetching.
 */
export interface PartnerResourceLanguageVariant {
  code: string;
  mediaUrl: string;
}

export interface PartnerResourceItem {
  id: string;
  partner: string;
  kind: "document" | "video";
  title: string;
  description: string;
  mediaUrl: string;
  languages: PartnerResourceLanguageVariant[];
  category: string;
  subcategory: string | null;
  weight: number;
}

export interface PartnerResourceSubgroup {
  subcategory: string | null;
  items: PartnerResourceItem[];
}

export interface PartnerResourceGroup {
  category: string;
  subgroups: PartnerResourceSubgroup[];
}

/** Groups already-weight-sorted items by category, then subcategory — preserves first-seen order rather than re-sorting alphabetically. */
function groupByCategory(items: PartnerResourceItem[]): PartnerResourceGroup[] {
  const groups: PartnerResourceGroup[] = [];
  for (const item of items) {
    let group = groups.find((g) => g.category === item.category);
    if (!group) {
      group = { category: item.category, subgroups: [] };
      groups.push(group);
    }
    let subgroup = group.subgroups.find((s) => s.subcategory === item.subcategory);
    if (!subgroup) {
      subgroup = { subcategory: item.subcategory, items: [] };
      group.subgroups.push(subgroup);
    }
    subgroup.items.push(item);
  }
  return groups;
}

const items = ref<PartnerResourceItem[]>([]);
const loading = ref(false);
const loadError = ref(false);
const loadedForLocale = ref<string | null>(null);

const documents = computed(() => items.value.filter((r) => r.kind === "document"));
const videos = computed(() => items.value.filter((r) => r.kind === "video"));
const documentGroups = computed(() => groupByCategory(documents.value));
const videoGroups = computed(() => groupByCategory(videos.value));

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
  return { items, documents, videos, documentGroups, videoGroups, loading, loadError, load };
}
