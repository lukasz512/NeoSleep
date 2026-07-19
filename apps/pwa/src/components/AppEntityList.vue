<template>
  <div class="app-entity-list">
    <div v-if="!isTrulyEmpty && !loadError && !isInitialLoading" class="app-entity-list__toolbar">
      <div class="app-entity-list__search-group">
        <VTooltip :disabled="!searchCollapsed" location="bottom">
          <template #activator="{ props: searchTooltipProps }">
            <VTextField
              v-bind="searchTooltipProps"
              v-model="searchQuery"
              type="search"
              :class="['app-entity-list__search', { 'app-entity-list__search--collapsed': searchCollapsed }]"
              :placeholder="t(i18n.searchPlaceholder)"
              :aria-label="t(i18n.searchPlaceholder)"
              autocomplete="off"
              density="comfortable"
              variant="outlined"
              hide-details
              :clearable="false"
              :loading="loading ? 'primary' : false"
              @focus="isSearchFocused = true"
              @blur="isSearchFocused = false"
            >
              <template #prepend-inner>
                <AppIcon name="search" class="app-entity-list__search-icon" />
              </template>
              <template #append-inner>
                <VTooltip v-if="searchQuery.trim() && !mobile" location="bottom">
                  <template #activator="{ props: tooltipProps }">
                    <AppButton
                      v-bind="tooltipProps"
                      icon
                      variant="flat"
                      size="small"
                      :loading="clearingSearch"
                      class="app-entity-list__search-clear"
                      :aria-label="t(i18n.filtersClear)"
                      @click="onSearchClear"
                    >
                      <AppIcon name="close" class="app-entity-list__icon" />
                    </AppButton>
                  </template>
                  <span>{{ t(i18n.filtersClear) }}</span>
                </VTooltip>
              </template>
            </VTextField>
          </template>
          <span>{{ t(i18n.searchPlaceholder) }}</span>
        </VTooltip>
        <AppFilterBar
          :model-value="filterState"
          :definitions="props.filterDefinitions"
          :title-key="i18n.filtersTitle"
          :clear-key="i18n.filtersClear"
          :active-filter-count="activeFilterCount"
          @update:model-value="onFilterStateUpdate"
          @clear="onFiltersClear"
        />
        <VTooltip v-if="hasActiveFiltersOrSearch" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :loading="clearingFilters"
              class="app-entity-list__clear-filters app-entity-list__clear-filters--no-border"
              :aria-label="t(i18n.filtersClear)"
              @click="onFiltersClear"
            >
              <AppIcon name="close" class="app-entity-list__icon" />
            </AppButton>
          </template>
          <span>{{ t(i18n.filtersClear) }}</span>
        </VTooltip>
      </div>
      <VTooltip v-if="showAddButton" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="app-entity-list__add app-entity-list__add--no-border"
            :aria-label="t(i18n.add)"
            @click="$emit('add')"
          >
            <AppIcon name="plus" class="app-entity-list__icon" />
          </AppButton>
        </template>
        <span>{{ t(i18n.add) }}</span>
      </VTooltip>
    </div>

    <div v-if="loadError" class="app-entity-list__error-wrap">
      <AppErrorState
        :title="t('app.errorState.title')"
        :subtitle="loadError"
        :refresh-label="t('app.errorState.refresh')"
        :loading="loading"
        @refresh="loadData"
      />
    </div>

    <div v-else-if="isTrulyEmpty" class="app-entity-list__empty-wrap">
      <AppEmptyState
        :title="t(i18n.emptyTitle)"
        :subtitle="t(i18n.emptySubtitle)"
        :show-add-button="showAddButton"
        :add-label="t(i18n.add)"
        @add="$emit('add')"
      />
    </div>

    <div v-else-if="isInitialLoading" class="app-entity-list__loading-wrap">
      <AppLoadingState />
    </div>

    <div v-else :class="['app-entity-list__table-wrap', { 'app-entity-list__table-wrap--flat': mobile }]">
      <div
        v-if="!loading && total === 0 && hasActiveFiltersOrSearch"
        class="app-entity-list__no-results-placeholder"
        role="status"
      >
        <div class="app-entity-list__no-results-icon-wrap" aria-hidden="true">
          <AppIcon name="search" class="app-entity-list__no-results-icon" />
        </div>
        <p class="app-entity-list__no-results-title">{{ t(i18n.noResultsForCriteria) }}</p>
        <p class="app-entity-list__no-results-subtitle">{{ t(i18n.noResultsForCriteriaSubtitle) }}</p>
        <AppButton variant="outlined" color="primary" :loading="clearingFilters" class="app-entity-list__no-results-clear" @click="onFiltersClear">
          {{ t(i18n.filtersClear) }}
        </AppButton>
      </div>
      <template v-else>
        <VDataTableServer
          v-show="!mobile"
          v-model:options="tableOptions"
          :headers="headers"
          :items="items"
          :items-length="total"
          :item-value="itemValue"
          class="app-entity-list__table"
          hover
          :row-props="rowProps"
          @update:options="onOptionsUpdate"
        >
          <template v-for="(_, name) in $slots" :key="name" #[name]="slotData">
            <slot :name="name" v-bind="slotData" />
          </template>
        </VDataTableServer>
        <TransitionGroup v-show="mobile" name="list-stagger" tag="div" class="app-entity-list__feed">
          <VCard
            v-for="(item, index) in items"
            :key="(item as Record<string, unknown>)[itemValue]"
            variant="flat"
            elevation="1"
            :class="[
              'app-entity-list__card',
              'app-entity-list__card--clickable',
              { 'app-entity-list__card--disabled': isOtherItemLoading(item) },
            ]"
            :style="{ '--stagger-delay': `${index * 40}ms` }"
            @click="onRowClick(item)"
          >
            <div class="app-entity-list__card-body">
              <div v-if="$slots['feed-card-avatar']" class="app-entity-list__card-avatar">
                <slot name="feed-card-avatar" :item="item" />
              </div>
              <div class="app-entity-list__card-main">
                <div class="text-body-1 font-weight-medium app-entity-list__card-title">
                  <slot name="feed-card-title" :item="item">
                    {{ getCell(item, titleKey) }}
                  </slot>
                </div>
                <div v-if="metaKeys.length" class="text-caption text-medium-emphasis app-entity-list__card-meta">
                  <slot name="feed-card-meta" :item="item">
                    {{ formatMeta(item) }}
                  </slot>
                </div>
              </div>
              <div class="app-entity-list__card-side">
                <div v-if="$slots['feed-card-status']" class="app-entity-list__card-status">
                  <slot name="feed-card-status" :item="item" />
                </div>
                <div v-if="$slots['feed-card-actions']" class="app-entity-list__card-actions" @click.stop>
                  <slot name="feed-card-actions" :item="item" />
                </div>
              </div>
            </div>
            <VProgressLinear
              v-if="isItemLoading(item)"
              indeterminate
              height="2"
              color="primary"
              class="app-entity-list__card-loader"
            />
          </VCard>
          <VAlert
            v-if="!loading && items.length === 0"
            key="_empty"
            type="info"
            variant="tonal"
            density="comfortable"
            class="app-entity-list__feed-empty"
          >
            {{ t(i18n.tableNoResults) }}
          </VAlert>
        </TransitionGroup>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useDisplay } from "vuetify";
import { useI18n } from "vue-i18n";
import AppButton from "./AppButton.vue";
import AppEmptyState from "./AppEmptyState.vue";
import AppErrorState from "./AppErrorState.vue";
import AppLoadingState from "./AppLoadingState.vue";
import AppIcon from "./AppIcon.vue";
import AppFilterBar from "./AppFilterBar.vue";
import { useEntityList } from "../composables/useEntityList";
import type { FilterDefinition } from "../composables/useFilters";

export interface AppEntityListHeader {
  title: string;
  key: string;
  sortable?: boolean;
}

export interface AppEntityListI18n {
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
    headers: AppEntityListHeader[];
    filterDefinitions: FilterDefinition[];
    i18n: AppEntityListI18n;
    showAddButton?: boolean;
    detailRouteName?: string;
    detailRouteParam?: string;
    filterParamKeys?: string[];
    searchParamKey?: string;
    sortColumns?: string[];
    /** id of the mobile feed item currently running a menu action (no dialog) —
     *  shows a bottom loading bar on that item and dims/disables the rest,
     *  mirroring AppButton's disabled-while-loading convention. */
    loadingItemId?: string | null;
  }>(),
  {
    showAddButton: false,
    detailRouteParam: "id",
    filterParamKeys: () => [],
    searchParamKey: "search",
    sortColumns: undefined,
    loadingItemId: null,
  }
);

defineEmits<{ add: [] }>();

const { t } = useI18n();
const { mobile } = useDisplay();



const {
  searchQuery, filterState, activeFilterCount, tableOptions,
  loading, clearingSearch, clearingFilters, loadError, items, total,
  hasActiveFiltersOrSearch, isTrulyEmpty,
  onFilterStateUpdate, onFiltersClear, onSearchClear,
  onOptionsUpdate, rowProps, onRowClick, loadData,
} = useEntityList({
  viewId: props.viewId,
  apiEndpoint: props.apiEndpoint,
  filterDefinitions: props.filterDefinitions,
  i18n: props.i18n,
  detailRouteName: props.detailRouteName,
  detailRouteParam: props.detailRouteParam,
  filterParamKeys: props.filterParamKeys,
  searchParamKey: props.searchParamKey,
});

const isSearchFocused = ref(false);
const searchCollapsed = computed(
  () => mobile.value && !isSearchFocused.value && !searchQuery.value.trim(),
);

const itemValue = "id";
const isInitialLoading = computed(() => loading.value && items.value.length === 0);
const titleKey = computed(() => (props.headers.length > 0 ? props.headers[0].key : "name"));
const metaKeys = computed(() => props.headers.slice(1).map((h) => h.key));

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

function rawItemId(item: unknown): unknown {
  return (item as Record<string, unknown>)[itemValue];
}

function isItemLoading(item: unknown): boolean {
  return props.loadingItemId != null && rawItemId(item) === props.loadingItemId;
}

function isOtherItemLoading(item: unknown): boolean {
  return props.loadingItemId != null && rawItemId(item) !== props.loadingItemId;
}
</script>

<style scoped src="./AppEntityList.css" />
