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
                <AppIcon name="close" class="rep-entity-list__icon" />
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
              <AppIcon name="close" class="rep-entity-list__icon" />
            </VBtn>
          </template>
          <span>{{ t(i18n.filtersClear) }}</span>
        </VTooltip>
        <RepFilterBar
          :model-value="filterState"
          :definitions="props.filterDefinitions"
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
              <AppIcon name="plus" class="rep-entity-list__icon" />
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
        @refresh="loadData"
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
          <AppIcon name="search" class="rep-entity-list__no-results-icon" />
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
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppEmptyState from "./AppEmptyState.vue";
import AppErrorState from "./AppErrorState.vue";
import AppIcon from "./AppIcon.vue";
import RepFilterBar from "./RepFilterBar.vue";
import { useEntityList } from "../composables/useEntityList";
import type { RepFilterDefinition } from "../composables/useRepFilters";

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
    i18n: RepEntityListI18n;
    showAddButton?: boolean;
    detailRouteName?: string;
    detailRouteParam?: string;
    filterParamKeys?: string[];
    searchParamKey?: string;
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

defineEmits<{ add: [] }>();

const { t } = useI18n();



const {
  searchQuery, filterState, activeFilterCount, tableOptions,
  loading, loadError, items, total,
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

const itemValue = "id";
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
</script>

<style scoped src="./RepEntityList.css" />
