import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useDebounceFn } from "@vueuse/core";
import { apiFetch } from "./useApi";
import { useFilters, type FilterDefinition } from "./useFilters";
import { CACHEABLE_ENTITIES, type CacheableEntity } from "../utils/offlineCache";
import { useEntityCacheStore } from "../stores/entityCache";

export interface EntityListOptions {
  viewId: string;
  apiEndpoint: string;
  filterDefinitions: FilterDefinition[];
  i18n: { errorLoad: string };
  detailRouteName?: string;
  detailRouteParam?: string;
  /** Optional extra query params for the detail-route push (e.g. deep-linking into a specific tab). */
  detailRouteQuery?: (item: Record<string, unknown>) => Record<string, string>;
  filterParamKeys?: string[];
  searchParamKey?: string;
  /**
   * Offline read cache (see docs/ADR-013-offline-read-cache.md). Defaults to
   * true; set false for entities that must not be persisted client-side
   * (`patient` — GDPR Art. 9 data, see PatientsView.vue).
   */
  cacheable?: boolean;
}

function cacheableEntityFor(viewId: string, cacheable: boolean | undefined): CacheableEntity | null {
  if (cacheable === false) return null;
  return (CACHEABLE_ENTITIES as readonly string[]).includes(viewId) ? (viewId as CacheableEntity) : null;
}

export function useEntityList(opts: EntityListOptions) {
  const { t } = useI18n();
  const router = useRouter();

  const cacheEntity = cacheableEntityFor(opts.viewId, opts.cacheable);
  const cacheStore = cacheEntity ? useEntityCacheStore(cacheEntity) : null;
  /** True while `items`/`mobileItems` are being served from the offline cache, not the network. */
  const isOffline = ref(false);

  const searchQuery = ref("");
  const { filterState, activeFilterCount, clearFilters } = useFilters(
    opts.viewId,
    opts.filterDefinitions,
  );

  const tableOptions = ref({
    page: 1,
    itemsPerPage: 10,
    sortBy: [{ key: "created_at", order: "desc" as const }],
  });
  /**
   * Starts true, not false: onMounted below fires loadData() immediately,
   * but that first render still paints once before it does. Starting
   * false meant that one frame had loading=false + total=0 +
   * hasActiveFiltersOrSearch=false — exactly isTrulyEmpty's condition — so
   * the "no X yet, add one" empty state could flash before the loading
   * spinner ever showed. Starting true skips straight to the spinner.
   */
  const loading = ref(true);
  /**
   * Separate from `loading` (which drives the table/search-field spinner for
   * *any* reload) so that clicking "clear search" doesn't also light up the
   * "clear filters" button and vice versa — each clear action gets its own
   * button-scoped loading flag.
   */
  const clearingSearch = ref(false);
  const clearingFilters = ref(false);
  const loadError = ref("");
  const items = ref<Record<string, unknown>[]>([]);
  const total = ref(0);
  const hasCompletedInitialLoad = ref(false);

  /**
   * Mobile feed uses infinite scroll instead of the desktop table's page
   * controls. Kept as a separate accumulating list rather than reusing
   * `items` so that desktop pagination (which replaces `items` per page)
   * doesn't fight with mobile's append-as-you-scroll list.
   */
  const mobileItems = ref<Record<string, unknown>[]>([]);
  const mobileHasMore = ref(true);
  const loadingMore = ref(false);
  const mobilePage = ref(1);

  const hasActiveFiltersOrSearch = computed(
    () => searchQuery.value.trim() !== "" || activeFilterCount.value > 0,
  );

  const isTrulyEmpty = computed(
    () => !loading.value && !loadError.value && total.value === 0 && !hasActiveFiltersOrSearch.value,
  );

  const debouncedSearch = useDebounceFn(() => {
    tableOptions.value.page = 1;
    loadData();
  }, 300);
  watch(searchQuery, debouncedSearch);

  function onFilterStateUpdate(state: Record<string, string>) {
    filterState.value = state;
    tableOptions.value.page = 1;
    loadData();
  }

  async function onFiltersClear() {
    searchQuery.value = "";
    clearFilters();
    tableOptions.value.page = 1;
    (debouncedSearch as unknown as { cancel: () => void }).cancel?.();
    clearingFilters.value = true;
    try {
      await loadData();
    } finally {
      clearingFilters.value = false;
    }
  }

  async function onSearchClear() {
    searchQuery.value = "";
    tableOptions.value.page = 1;
    (debouncedSearch as unknown as { cancel: () => void }).cancel?.();
    clearingSearch.value = true;
    try {
      await loadData();
    } finally {
      clearingSearch.value = false;
    }
  }

  function onOptionsUpdate() {
    if (!hasCompletedInitialLoad.value) return;
    loadData();
  }

  function navigateToDetail(item: Record<string, unknown>) {
    const id = item[opts.detailRouteParam ?? "id"];
    if (id && opts.detailRouteName) {
      router.push({
        name: opts.detailRouteName,
        params: { [opts.detailRouteParam ?? "id"]: String(id) },
        query: opts.detailRouteQuery?.(item),
      });
    }
  }

  function rowProps({ item }: { item: Record<string, unknown> }) {
    if (!item[opts.detailRouteParam ?? "id"] || !opts.detailRouteName) return {};
    return { onClick: () => navigateToDetail(item) };
  }

  function onRowClick(item: Record<string, unknown>) {
    navigateToDetail(item);
  }

  function buildParams(page: number): URLSearchParams {
    const o = tableOptions.value;
    const sortBy = o.sortBy?.[0]?.key ?? "created_at";
    const sortOrder = o.sortBy?.[0]?.order ?? "desc";
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(o.itemsPerPage));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    if (searchQuery.value.trim())
      params.set(opts.searchParamKey ?? "search", searchQuery.value.trim());
    for (const key of opts.filterParamKeys ?? []) {
      const val = filterState.value[key];
      if (Array.isArray(val)) {
        for (const v of val) {
          const s = String(v).trim();
          if (s) params.append(key, s);
        }
      } else if (typeof val === "string") {
        const s = val.trim();
        if (s) params.set(key, s);
      }
    }
    return params;
  }

  async function loadData() {
    loading.value = true;
    loadError.value = "";
    const o = tableOptions.value;
    const isFreshLoad = o.page === 1;
    const params = buildParams(o.page);
    try {
      const res = await apiFetch(`${opts.apiEndpoint}?${params.toString()}`, {
        errorMessageKey: opts.i18n.errorLoad,
      });
      if (res.ok) {
        const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
        items.value = data.items;
        total.value = data.total;
        isOffline.value = false;
        if (isFreshLoad) {
          mobileItems.value = data.items;
          mobilePage.value = 1;
          mobileHasMore.value = data.items.length < data.total;
        }
        if (cacheStore) void cacheStore.cacheList(data.items);
      } else {
        items.value = [];
        total.value = 0;
        loadError.value = t(opts.i18n.errorLoad);
        if (isFreshLoad) {
          mobileItems.value = [];
          mobileHasMore.value = false;
        }
      }
    } catch {
      // Network failure (offline, DNS, timeout) — not a server error response, so
      // falling back to whatever this entity has cached is safe: we never reached
      // the server to know it's wrong. See docs/ADR-013-offline-read-cache.md.
      const cached = cacheStore && isFreshLoad ? await cacheStore.readList() : [];
      if (cached.length > 0) {
        items.value = cached;
        total.value = cached.length;
        mobileItems.value = cached;
        mobileHasMore.value = false;
        isOffline.value = true;
      } else {
        items.value = [];
        total.value = 0;
        loadError.value = t(opts.i18n.errorLoad);
        if (isFreshLoad) {
          mobileItems.value = [];
          mobileHasMore.value = false;
        }
      }
    } finally {
      loading.value = false;
      hasCompletedInitialLoad.value = true;
    }
  }

  async function loadMoreMobile() {
    if (loadingMore.value || !mobileHasMore.value) return;
    loadingMore.value = true;
    const nextPage = mobilePage.value + 1;
    const params = buildParams(nextPage);
    try {
      const res = await apiFetch(`${opts.apiEndpoint}?${params.toString()}`, {
        errorMessageKey: opts.i18n.errorLoad,
      });
      if (res.ok) {
        const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
        mobileItems.value = [...mobileItems.value, ...data.items];
        mobilePage.value = nextPage;
        total.value = data.total;
        mobileHasMore.value = mobileItems.value.length < data.total;
      } else {
        mobileHasMore.value = false;
      }
    } catch {
      mobileHasMore.value = false;
    } finally {
      loadingMore.value = false;
    }
  }

  const onRefresh = () => loadData();

  onMounted(() => {
    loadData();
    window.addEventListener("entity-list-refresh", onRefresh);
  });
  onUnmounted(() => {
    window.removeEventListener("entity-list-refresh", onRefresh);
  });

  return {
    searchQuery,
    filterState,
    activeFilterCount,
    tableOptions,
    loading,
    clearingSearch,
    clearingFilters,
    loadError,
    isOffline,
    items,
    total,
    mobileItems,
    mobileHasMore,
    loadingMore,
    hasActiveFiltersOrSearch,
    isTrulyEmpty,
    hasCompletedInitialLoad,
    onFilterStateUpdate,
    onFiltersClear,
    onSearchClear,
    onOptionsUpdate,
    rowProps,
    onRowClick,
    loadData,
    loadMoreMobile,
  };
}
