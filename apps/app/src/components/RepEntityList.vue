<template>
  <div class="rep-entity-list">
    <div v-if="!isTrulyEmpty && !loadError" class="rep-entity-list__toolbar">
      <VTextField
        v-model="searchQuery"
        type="search"
        class="rep-entity-list__search"
        :placeholder="t(i18n.searchPlaceholder)"
        :aria-label="t(i18n.searchPlaceholder)"
        autocomplete="off"
        density="comfortable"
        variant="outlined"
        hide-details
        :clearable="false"
      >
        <template #append-inner>
          <VTooltip v-if="searchQuery.trim()" location="bottom">
            <template #activator="{ props: tooltipProps }">
              <VBtn
                v-bind="tooltipProps"
                icon
                variant="flat"
                size="small"
                class="rep-entity-list__search-clear rep-entity-list__search-clear--desktop-only"
                :aria-label="t(i18n.filtersClear)"
                @click="onSearchClear"
              >
                <svg class="rep-entity-list__clear-filters-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </VBtn>
            </template>
            <span>{{ t(i18n.filtersClear) }}</span>
          </VTooltip>
        </template>
      </VTextField>
      <div class="rep-entity-list__toolbar-right">
        <VTooltip v-if="hasActiveFiltersOrSearch" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              class="rep-entity-list__clear-filters rep-entity-list__clear-filters--no-border"
              :aria-label="t(i18n.filtersClear)"
              @click="onFiltersClear"
            >
              <svg class="rep-entity-list__clear-filters-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </VBtn>
          </template>
          <span>{{ t(i18n.filtersClear) }}</span>
        </VTooltip>
        <RepFilterBar
          :model-value="filterState"
          :definitions="filterDefinitions"
          :title-key="i18n.filtersTitle"
          :clear-key="i18n.filtersClear"
          :active-filter-count="activeFilterCount"
          @update:model-value="onFilterStateUpdate"
          @clear="onFiltersClear"
        />
        <VTooltip v-if="showAddButton" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              class="rep-entity-list__add rep-entity-list__add--no-border"
              :aria-label="t(i18n.add)"
              @click="$emit('add')"
            >
              <svg class="rep-entity-list__add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </VBtn>
          </template>
          <span>{{ t(i18n.add) }}</span>
        </VTooltip>
      </div>
    </div>

    <div v-if="loadError" class="rep-entity-list__error-wrap">
      <AppErrorState
        :title="t('app.errorState.title')"
        :subtitle="loadError"
        :refresh-label="t('app.errorState.refresh')"
        @refresh="onRefresh"
      />
    </div>

    <div v-else-if="isTrulyEmpty" class="rep-entity-list__empty-wrap">
      <AppEmptyState
        :title="t(i18n.emptyTitle)"
        :subtitle="t(i18n.emptySubtitle)"
        :show-add-button="showAddButton"
        :add-label="t(i18n.add)"
        @add="$emit('add')"
      />
    </div>

    <div v-else class="rep-entity-list__table-wrap">
      <div
        v-if="!loading && total === 0 && hasActiveFiltersOrSearch"
        class="rep-entity-list__no-results-placeholder"
        role="status"
      >
        <div class="rep-entity-list__no-results-icon-wrap" aria-hidden="true">
          <svg
            class="rep-entity-list__no-results-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <!-- Magnifying glass: search / no results metaphor -->
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <p class="rep-entity-list__no-results-title">{{ t(i18n.noResultsForCriteria) }}</p>
        <p class="rep-entity-list__no-results-subtitle">{{ t(i18n.noResultsForCriteriaSubtitle) }}</p>
        <VBtn variant="outlined" color="primary" class="rep-entity-list__no-results-clear" @click="onFiltersClear">
          {{ t(i18n.filtersClear) }}
        </VBtn>
      </div>
      <template v-else>
        <VDataTableServer
          v-model:options="tableOptions"
          :headers="headers"
          :items="items"
          :items-length="total"
          :loading="loading"
          :item-value="itemValue"
          class="rep-entity-list__table"
          hover
          :row-props="rowProps"
          @update:options="onOptionsUpdate"
        >
          <template v-for="(_, name) in $slots" :key="name" #[name]="slotData">
            <slot :name="name" v-bind="slotData" />
          </template>
        </VDataTableServer>
        <TransitionGroup name="list-stagger" tag="div" class="rep-entity-list__feed">
          <VCard
            v-for="(item, index) in items"
            :key="(item as Record<string, unknown>)[itemValue]"
            variant="outlined"
            class="rep-entity-list__card rep-entity-list__card--clickable"
            :style="{ '--stagger-delay': `${index * 40}ms` }"
            @click="onRowClick(item)"
          >
            <VCardTitle class="text-body-1 font-weight-medium rep-entity-list__card-title">
              <slot name="feed-card-title" :item="item">
                {{ getCell(item, titleKey) }}
              </slot>
            </VCardTitle>
            <VCardSubtitle v-if="metaKeys.length" class="text-caption text-medium-emphasis rep-entity-list__card-meta">
              <slot name="feed-card-meta" :item="item">
                {{ formatMeta(item) }}
              </slot>
            </VCardSubtitle>
          </VCard>
          <VAlert
            v-if="!loading && items.length === 0"
            key="_empty"
            type="info"
            variant="tonal"
            density="comfortable"
            class="rep-entity-list__feed-empty"
          >
            {{ t(i18n.tableNoResults) }}
          </VAlert>
        </TransitionGroup>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import AppEmptyState from "./AppEmptyState.vue";
import AppErrorState from "./AppErrorState.vue";
import RepFilterBar from "./RepFilterBar.vue";
import { apiFetch } from "../utils/api";
import { useRepFilters, type RepFilterDefinition } from "../composables/useRepFilters";

export interface RepEntityListHeader {
  title: string;
  key: string;
  sortable?: boolean;
}

export interface RepEntityListI18n {
  searchPlaceholder: string;
  filtersTitle: string;
  filtersClear: string;
  add: string;
  emptyTitle: string;
  emptySubtitle: string;
  noResultsForCriteria: string;
  noResultsForCriteriaSubtitle: string;
  tableNoResults: string;
  errorLoad: string;
}

const props = withDefaults(
  defineProps<{
    viewId: string;
    apiEndpoint: string;
    headers: RepEntityListHeader[];
    filterDefinitions: RepFilterDefinition[];
    filterDefinitionsWithOptions: RepFilterDefinition[];
    i18n: RepEntityListI18n;
    showAddButton?: boolean;
    detailRouteName?: string;
    detailRouteParam?: string;
    /** Filter keys to pass as query params (e.g. status, region). */
    filterParamKeys?: string[];
    /** Search param name (default: search). */
    searchParamKey?: string;
    /** Sort columns allowed (default: first header key + created_at). */
    sortColumns?: string[];
  }>(),
  {
    showAddButton: false,
    detailRouteParam: "id",
    filterParamKeys: () => [],
    searchParamKey: "search",
    sortColumns: undefined,
  }
);

defineEmits<{
  add: [];
}>();

const { t } = useI18n();
const router = useRouter();

const searchQuery = ref("");
const { filterState, activeFilterCount, clearFilters } = useRepFilters(
  props.viewId,
  props.filterDefinitions
);

const tableOptions = ref({
  page: 1,
  itemsPerPage: 10,
  sortBy: [{ key: "created_at", order: "desc" as const }],
});
const loading = ref(false);
const loadError = ref("");
const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
/** Prevents duplicate load when VDataTableServer emits update:options on its initial mount. */
const hasCompletedInitialLoad = ref(false);

const filterDefinitions = computed(() => props.filterDefinitionsWithOptions);

const hasActiveFiltersOrSearch = computed(
  () => searchQuery.value.trim() !== "" || activeFilterCount.value > 0
);

const isTrulyEmpty = computed(
  () => !loading.value && !loadError.value && total.value === 0 && !hasActiveFiltersOrSearch.value
);

const titleKey = computed(() => (props.headers.length > 0 ? props.headers[0].key : "name"));
const metaKeys = computed(() => props.headers.slice(1).map((h) => h.key));
const itemValue = "id";

function onFilterStateUpdate(state: Record<string, string>) {
  filterState.value = state;
  tableOptions.value.page = 1;
  loadData();
}

function onFiltersClear() {
  searchQuery.value = "";
  clearFilters();
  tableOptions.value.page = 1;
  loadData();
}

function onSearchClear() {
  searchQuery.value = "";
  tableOptions.value.page = 1;
  loadData();
}

function getCell(item: Record<string, unknown>, key: string): string {
  const v = item[key];
  return v != null ? String(v) : "";
}

function formatMeta(item: Record<string, unknown>): string {
  return metaKeys.value
    .map((k) => getCell(item, k))
    .filter(Boolean)
    .join(" · ");
}

function rowProps({ item }: { item: Record<string, unknown> }) {
  const id = item[props.detailRouteParam ?? "id"];
  if (!id || !props.detailRouteName) return {};
  return {
    onClick: () => router.push({ name: props.detailRouteName!, params: { [props.detailRouteParam ?? "id"]: String(id) } }),
  };
}

function onRowClick(item: Record<string, unknown>) {
  const id = item[props.detailRouteParam ?? "id"];
  if (id && props.detailRouteName) {
    router.push({ name: props.detailRouteName, params: { [props.detailRouteParam ?? "id"]: String(id) } });
  }
}

function onOptionsUpdate() {
  if (!hasCompletedInitialLoad.value) return;
  loadData();
}

async function loadData() {
  loading.value = true;
  loadError.value = "";
  const opts = tableOptions.value;
  const sortBy = opts.sortBy?.[0]?.key ?? "created_at";
  const sortOrder = opts.sortBy?.[0]?.order ?? "desc";
  const params = new URLSearchParams();
  params.set("page", String(opts.page));
  params.set("limit", String(opts.itemsPerPage));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  if (searchQuery.value.trim()) params.set(props.searchParamKey ?? "search", searchQuery.value.trim());
  for (const key of props.filterParamKeys ?? []) {
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
    const res = await apiFetch(`${props.apiEndpoint}?${params.toString()}`, {
      errorMessageKey: props.i18n.errorLoad,
    });
    if (res.ok) {
      const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
      items.value = data.items;
      total.value = data.total;
    } else {
      items.value = [];
      total.value = 0;
      loadError.value = t(props.i18n.errorLoad);
    }
  } catch {
    items.value = [];
    total.value = 0;
    loadError.value = t(props.i18n.errorLoad);
  } finally {
    loading.value = false;
    hasCompletedInitialLoad.value = true;
  }
}

const onRefresh = () => loadData();
onMounted(() => {
  loadData();
  window.addEventListener("rep-entity-list-refresh", onRefresh);
});
onUnmounted(() => {
  window.removeEventListener("rep-entity-list-refresh", onRefresh);
});

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    tableOptions.value.page = 1;
    loadData();
    searchDebounce = null;
  }, 300);
});
</script>

<style lang="scss">
/* Staggered list animation: physics-inspired, minimal. Not scoped – TransitionGroup classes. */
.list-stagger-move,
.list-stagger-enter-active,
.list-stagger-leave-active {
  transition:
    opacity 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.list-stagger-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.list-stagger-enter-active {
  transition-delay: var(--stagger-delay, 0ms);
}

.list-stagger-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.list-stagger-leave-active {
  position: absolute;
  width: 100%;
}
</style>

<style lang="scss" scoped>
.rep-entity-list {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.rep-entity-list__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.rep-entity-list__toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.rep-entity-list__clear-filters {
  min-width: var(--rep-btn-min-width, 44px);
  min-height: var(--rep-btn-min-height, 44px);
}

.rep-entity-list__clear-filters--no-border {
  border: none;
  box-shadow: none;
  background: transparent;
  color: rgb(var(--v-theme-primary));

  &:hover {
    background: rgba(var(--v-theme-primary), 0.12);
  }
}

.rep-entity-list__clear-filters-icon {
  width: 24px;
  height: 24px;
  display: block;
  color: inherit;
}

.rep-entity-list__search-clear {
  min-width: 36px;
  min-height: 36px;
  border: none;
  box-shadow: none;
  background: transparent;
  color: rgb(var(--v-theme-primary));

  &:hover {
    background: rgba(var(--v-theme-primary), 0.12);
  }
}

/* On mobile: hide search input clear; toolbar clear (filters) is the only one */
@media (max-width: 767px) {
  .rep-entity-list__search-clear--desktop-only {
    display: none !important;
  }
}

.rep-entity-list__add {
  min-width: 44px;
  min-height: 44px;
  color: var(--rep-text, currentColor);
}

.rep-entity-list__add--no-border {
  border: none;
  box-shadow: none;
  background: transparent;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
}

/* Icon inherits color from button (theme-aware for light/dark mode) */
.rep-entity-list__add-icon {
  width: 24px;
  height: 24px;
  display: block;
  color: inherit;
}

.rep-entity-list__search {
  max-width: 320px;
  min-width: 180px;
}

.rep-entity-list__empty-wrap,
.rep-entity-list__error-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rep-entity-list__table-wrap {
  flex: 1 1 0;
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--rep-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.rep-entity-list__table-wrap :deep(.v-data-table) {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  min-height: 0;
}

.rep-entity-list__table-wrap :deep(.v-data-table__td) {
  transition: opacity 0.5s ease;
}

.rep-entity-list__table-wrap :deep(.v-data-table tbody tr) {
  transition: opacity 0.45s ease, background-color 0.25s ease;
}

.rep-entity-list__table-wrap :deep(.v-data-table-progress) {
  transition: opacity 0.4s ease;
}

.rep-entity-list__table-wrap :deep(.v-table__wrapper) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.rep-entity-list__table-wrap :deep(.v-data-table__tr--clickable) {
  cursor: pointer;
}

.rep-entity-list__card--clickable {
  cursor: pointer;
}

.rep-entity-list__no-results-placeholder {
  flex: 1;
  min-height: 40vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.rep-entity-list__no-results-icon-wrap {
  flex-shrink: 0;
  margin-bottom: 4px;
}

.rep-entity-list__no-results-icon {
  width: 72px;
  height: 72px;
  opacity: 0.5;
  color: rgb(var(--v-theme-primary));
}

@media (min-width: 768px) {
  .rep-entity-list__no-results-icon {
    width: 96px;
    height: 96px;
  }
}

.rep-entity-list__no-results-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.rep-entity-list__no-results-subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.rep-entity-list__no-results-clear {
  margin-top: 8px;
}

.rep-entity-list__table {
  min-width: 560px;
}

.rep-entity-list__feed {
  display: none;
}

@media (max-width: 767px) {
  .rep-entity-list__table-wrap :deep(.v-table) {
    display: none;
  }

  .rep-entity-list__feed {
    display: block;
    padding: 12px 0;
    border: none;
    position: relative;
  }
}

.rep-entity-list__card {
  margin-bottom: 12px;
}

.rep-entity-list__card:last-of-type {
  margin-bottom: 0;
}

.rep-entity-list__feed-empty {
  margin: 0;
}

.rep-entity-list__institution-link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.rep-entity-list__institution-link:hover {
  text-decoration: underline;
}

.rep-entity-list__cell-empty {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}
</style>
