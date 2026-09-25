import { reportCaught, reportFailedResponse } from "@api";
import { ref, computed } from "vue";
import { apiFetch } from "./useApi";
import { getApiUrl } from "../constants";

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

export type PartnerResourceFileType = "pdf" | "zip" | "image" | "video" | "other";

export interface PartnerResourceItem {
  id: string;
  partner: string;
  kind: "document" | "video";
  title: string;
  description: string;
  mediaUrl: string;
  fileType: PartnerResourceFileType;
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

/**
 * The API returns media paths relative to itself. `<video src>`/`<a href>`
 * would resolve them against the PWA's own host (a static site — no API
 * there) and can't send the Authorization header, so point them at the API
 * and add the media-only token it issued with the list (signMediaToken).
 */
export function playableMediaUrl(path: string, mediaToken: string | undefined): string {
  const url = `${getApiUrl()}${path}`;
  if (!mediaToken) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(mediaToken)}`;
}

const items = ref<PartnerResourceItem[]>([]);
const loading = ref(false);
const loadError = ref(false);
/** The error behind loadError (NEO-81) — lets the error state say offline vs. server problem. */
const loadFailure = ref<unknown>(null);
const loadedForLocale = ref<string | null>(null);
let loadedAt = 0;
/** Media tokens live 4h (API signMediaToken) — refetch before the cached URLs stop playing. */
const MEDIA_URL_MAX_AGE_MS = 3 * 60 * 60 * 1000;

const documents = computed(() => items.value.filter((r) => r.kind === "document"));
const videos = computed(() => items.value.filter((r) => r.kind === "video"));
const documentGroups = computed(() => groupByCategory(documents.value));
const videoGroups = computed(() => groupByCategory(videos.value));

/** Re-fetches only if not already loaded for this locale — safe to call repeatedly (preload + view mount). */
async function load(locale: string): Promise<void> {
  if (loadedForLocale.value === locale && !loadError.value && Date.now() - loadedAt < MEDIA_URL_MAX_AGE_MS) return;

  loading.value = true;
  loadError.value = false;
  loadFailure.value = null;
  try {
    const res = await apiFetch(`/api/v1/partners/orthoapnea/resources?locale=${locale}`, { handleErrors: false });
    if (!res.ok) {
      loadFailure.value = await reportFailedResponse(res, { where: "usePartnerResources.load" });
      loadError.value = true;
      return;
    }
    const data = (await res.json()) as { resources: PartnerResourceItem[]; mediaToken?: string };
    items.value = data.resources.map((r) => ({
      ...r,
      mediaUrl: playableMediaUrl(r.mediaUrl, data.mediaToken),
      languages: r.languages.map((l) => ({ ...l, mediaUrl: playableMediaUrl(l.mediaUrl, data.mediaToken) })),
    }));
    loadedForLocale.value = locale;
    loadedAt = Date.now();
  } catch (err) {
    reportCaught(err, { where: "usePartnerResources.load" });
    loadFailure.value = err;
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

export function usePartnerResources() {
  return { items, documents, videos, documentGroups, videoGroups, loading, loadError, loadFailure, load };
}
