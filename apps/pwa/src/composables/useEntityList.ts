import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useDebounceFn } from "@vueuse/core";
import { apiFetch } from "../utils/api";
import { useFilters, type FilterDefinition } from "./useFilters";

export interface EntityListOptions {
  viewId: string;
  apiEndpoint: string;
  filterDefinitions: FilterDefinition[];
  i18n: { errorLoad: string };
  detailRouteName?: string;
  detailRouteParam?: string;
  filterParamKeys?: string[];
  searchParamKey?: string;
}

export function useEntityList(opts: EntityListOptions) {
  const { t } = useI18n();
  const router = useRouter();

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
  const loading = ref(false);
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

  async function loadData() {
    loading.value = true;
    loadError.value = "";
    const o = tableOptions.value;
    const sortBy = o.sortBy?.[0]?.key ?? "created_at";
    const sortOrder = o.sortBy?.[0]?.order ?? "desc";
    const params = new URLSearchParams();
    params.set("page", String(o.page));
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
    try {
      const res = await apiFetch(`${opts.apiEndpoint}?${params.toString()}`, {
        errorMessageKey: opts.i18n.errorLoad,
      });
      if (res.ok) {
        const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
        items.value = data.items;
        total.value = data.total;
      } else {
        items.value = [];
        total.value = 0;
        loadError.value = t(opts.i18n.errorLoad);
      }
    } catch {
      items.value = [];
      total.value = 0;
      loadError.value = t(opts.i18n.errorLoad);
    } finally {
      loading.value = false;
      hasCompletedInitialLoad.value = true;
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
    items,
    total,
    hasActiveFiltersOrSearch,
    isTrulyEmpty,
    onFilterStateUpdate,
    onFiltersClear,
    onSearchClear,
    onOptionsUpdate,
    rowProps,
    onRowClick,
    loadData,
  };
}
