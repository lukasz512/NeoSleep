<template>
  <div class="app-entity-list">
    <div
      v-if="!isTrulyEmpty && !loadError && !isInitialLoading"
      :class="['app-entity-list__toolbar', { 'app-entity-list__toolbar--hidden': mobile && toolbarHiddenByScroll }]"
    >
      <div
        :class="['app-entity-list__search-group', { 'app-entity-list__search-group--active': hasActiveFiltersOrSearch }]"
      >
        <VTooltip :disabled="!searchCollapsed" location="bottom">
          <template #activator="{ props: searchTooltipProps }">
            <VTextField
              ref="searchFieldRef"
              v-bind="searchTooltipProps"
              v-model="searchQuery"
              type="search"
              :class="['app-entity-list__search', { 'app-entity-list__search--collapsed': searchCollapsed }]"
              :placeholder="t(i18n.searchPlaceholder)"
              :aria-label="t(i18n.searchPlaceholder)"
              autocomplete="off"
              density="comfortable"
              variant="outlined"
              rounded="pill"
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
                <div :class="['app-entity-list__search-clear-wrap', { 'app-entity-list__search-clear-wrap--hidden': !searchQuery.trim() }]">
                  <VTooltip :disabled="!searchQuery.trim()" location="bottom">
                    <template #activator="{ props: tooltipProps }">
                      <AppButton
                        v-bind="tooltipProps"
                        icon
                        variant="flat"
                        size="small"
                        :loading="clearingSearch"
                        ignore-global-loading
                        :tabindex="searchQuery.trim() ? 0 : -1"
                        class="app-entity-list__search-clear"
                        :aria-label="t(i18n.filtersClear)"
                        @click="onSearchClearClick"
                      >
                        <AppIcon name="close" class="app-entity-list__icon" />
                      </AppButton>
                    </template>
                    <span>{{ t(i18n.filtersClear) }}</span>
                  </VTooltip>
                </div>
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
        <div :class="['app-entity-list__clear-filters-wrap', { 'app-entity-list__clear-filters-wrap--hidden': !hasActiveFiltersOrSearch }]">
          <VTooltip :disabled="!hasActiveFiltersOrSearch" location="bottom">
            <template #activator="{ props: tooltipProps }">
              <AppButton
                v-bind="tooltipProps"
                icon
                variant="flat"
                size="large"
                :loading="clearingFilters"
                ignore-global-loading
                :tabindex="hasActiveFiltersOrSearch ? 0 : -1"
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

    <VAlert
      v-if="isOffline"
      type="warning"
      variant="tonal"
      density="compact"
      class="app-entity-list__offline-banner"
      :text="t('app.common.offlineShowingCached')"
    />

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
        <div v-show="mobile" ref="feedScrollRef" class="app-entity-list__feed-scroll" @scroll="onFeedScroll">
          <TransitionGroup name="list-stagger" tag="div" class="app-entity-list__feed">
            <VCard
              v-for="(item, index) in mobileItems"
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
              v-if="!loading && mobileItems.length === 0"
              key="_empty"
              type="info"
              variant="tonal"
              density="comfortable"
              class="app-entity-list__feed-empty"
            >
              {{ t(i18n.tableNoResults) }}
            </VAlert>
            <div v-if="mobileHasMore" key="_load-more" ref="loadMoreSentinelRef" class="app-entity-list__load-more">
              <AppSpinner v-if="loadingMore" size="24" width="2" />
            </div>
          </TransitionGroup>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useDisplay } from "vuetify";
import { useI18n } from "vue-i18n";
import { useIntersectionObserver } from "@vueuse/core";
import AppButton from "./AppButton.vue";
import AppEmptyState from "./AppEmptyState.vue";
import AppErrorState from "./AppErrorState.vue";
import AppLoadingState from "./AppLoadingState.vue";
import AppIcon from "./AppIcon.vue";
import AppFilterBar from "./AppFilterBar.vue";
import AppSpinner from "./AppSpinner.vue";
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
    /** Offline read cache (see docs/ADR-013-offline-read-cache.md) — set false for entities
     *  that must not be persisted client-side (`patient`, GDPR Art. 9 data). */
    cacheable?: boolean;
  }>(),
  {
    showAddButton: false,
    detailRouteParam: "id",
    filterParamKeys: () => [],
    searchParamKey: "search",
    sortColumns: undefined,
    loadingItemId: null,
    cacheable: true,
  }
);

defineEmits<{ add: [] }>();

const { t } = useI18n();
const { mobile } = useDisplay();



const {
  searchQuery, filterState, activeFilterCount, tableOptions,
  loading, clearingSearch, clearingFilters, loadError, isOffline, items, total,
  mobileItems, mobileHasMore, loadingMore,
  hasActiveFiltersOrSearch, isTrulyEmpty, hasCompletedInitialLoad,
  onFilterStateUpdate, onFiltersClear, onSearchClear,
  onOptionsUpdate, rowProps, onRowClick, loadData, loadMoreMobile,
} = useEntityList({
  viewId: props.viewId,
  apiEndpoint: props.apiEndpoint,
  filterDefinitions: props.filterDefinitions,
  i18n: props.i18n,
  detailRouteName: props.detailRouteName,
  detailRouteParam: props.detailRouteParam,
  filterParamKeys: props.filterParamKeys,
  searchParamKey: props.searchParamKey,
  cacheable: props.cacheable,
});

const loadMoreSentinelRef = ref<HTMLElement | null>(null);
useIntersectionObserver(loadMoreSentinelRef, ([entry]) => {
  if (entry?.isIntersecting && mobile.value) loadMoreMobile();
});

/* Mobile only: the search/filter toolbar collapses away while scrolling down
   the feed (more room for the list) and reinstates as soon as the rep
   scrolls back up, or nears the top — a small buffer around the direction
   flip avoids it flickering on sub-pixel scroll jitter. */
const feedScrollRef = ref<HTMLElement | null>(null);
const toolbarHiddenByScroll = ref(false);
let lastScrollTop = 0;
const SCROLL_HIDE_BUFFER = 8;

function onFeedScroll(e: Event) {
  const el = e.currentTarget as HTMLElement;
  const scrollTop = el.scrollTop;
  const delta = scrollTop - lastScrollTop;

  if (scrollTop <= SCROLL_HIDE_BUFFER) {
    toolbarHiddenByScroll.value = false;
  } else if (delta > SCROLL_HIDE_BUFFER) {
    toolbarHiddenByScroll.value = true;
  } else if (delta < -SCROLL_HIDE_BUFFER) {
    toolbarHiddenByScroll.value = false;
  }
  lastScrollTop = scrollTop;
}

const isSearchFocused = ref(false);
const searchCollapsed = computed(
  () => mobile.value && !isSearchFocused.value && !searchQuery.value.trim(),
);

const searchFieldRef = ref<{ focus: () => void } | null>(null);
function onSearchClearClick() {
  onSearchClear();
  searchFieldRef.value?.focus();
}

const itemValue = "id";
/* Only the very first load for this view (nothing fetched yet) shows the
   full-page skeleton. A search/filter-triggered reload sets `loading` too,
   but items/total stay at their previous values until the response lands —
   gating on items.length===0 here used to also catch "search already
   matched nothing, now typing more" and tear down the toolbar + swap in the
   skeleton mid-keystroke, which flashed away the very input being typed
   into. */
const isInitialLoading = computed(() => loading.value && !hasCompletedInitialLoad.value);
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
