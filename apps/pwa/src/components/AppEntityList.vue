<template>
  <div class="app-entity-list">
    <!-- NEO-55: the toolbar sits in AppLayout's page header, on the same row
         as the module title (usePageHeader.ts) — on phones too since NEO-113,
         where Filter / + fold into "⋯" when the title would be cut. -->
    <Teleport v-if="!isTrulyEmpty && !loadError && !isInitialLoading" :to="pageHeader.to" defer :disabled="pageHeader.disabled.value">
    <div
      ref="toolbarRef"
      :class="[
        'app-entity-list__toolbar',
        {
          'app-entity-list__toolbar--hidden': mobile && toolbarHiddenByScroll && pageHeader.disabled.value,
          'app-entity-list__toolbar--in-header': !pageHeader.disabled.value,
          'app-entity-list__toolbar--mobile': mobile,
          'app-entity-list__toolbar--compact-search': compactSearch,
          'app-entity-list__toolbar--search-open': compactSearch && !overlayMode && searchFocused,
          'app-entity-list__toolbar--has-query': compactSearch && !overlayMode && !!searchQuery.trim(),
          'app-entity-list__toolbar--overlay-open': overlayOpen,
          'app-entity-list__toolbar--folded': toolsFolded,
        },
      ]"
      data-testid="entity-list-toolbar"
    >
      <div class="app-entity-list__search-group">
        <!-- NEO-152: holds the search's place in the row. When the icon-only
             search opens in the page header, the field lifts out over the
             whole row (position: absolute, clip-path growing from this icon)
             while this slot keeps its 48 px, so nothing beside it moves. -->
        <div ref="searchSlotRef" class="app-entity-list__search-slot">
        <VTextField
          ref="searchFieldRef"
          v-model="searchQuery"
          type="search"
          class="app-entity-list__search"
          data-testid="entity-list-search"
          @update:focused="(f: boolean) => (searchFocused = f)"
          :placeholder="t(i18n.searchPlaceholder)"
          :aria-label="t(i18n.searchPlaceholder)"
          autocomplete="off"
          density="comfortable"
          variant="outlined"
          rounded="pill"
          hide-details
          :clearable="false"
          :loading="loading ? 'primary' : false"
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
                    @mousedown.prevent
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
        </div>
        <div class="app-entity-list__tool app-entity-list__tool--foldable" data-testid="entity-list-filter">
          <AppFilterBar
            ref="filterBarRef"
            :anchor="toolsFolded ? moreAnchorRef : null"
            :model-value="filterState"
            :definitions="props.filterDefinitions"
            :title-key="i18n.filtersTitle"
            :clear-key="i18n.filtersClear"
            :active-filter-count="activeFilterCount"
            @update:model-value="onFilterStateUpdate"
            @clear="onFiltersClear"
          />
        </div>
        <!-- On a phone the search pill carries its own clear button, so the
             red clear-all only appears there for active filters. -->
        <div
          :class="[
            'app-entity-list__tool',
            'app-entity-list__tool--foldable',
            'app-entity-list__clear-filters-wrap',
            { 'app-entity-list__clear-filters-wrap--hidden': mobile ? activeFilterCount === 0 : !hasActiveFiltersOrSearch },
          ]"
        >
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
      <div v-if="showAddButton" class="app-entity-list__tool app-entity-list__tool--foldable" data-testid="entity-list-add">
        <VTooltip location="bottom">
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
      <!-- NEO-113: Filter / + / clear-all folded into one menu when the module
           title next to them would otherwise be cut. The filter panel opens
           anchored to this button (AppFilterBar :anchor). -->
      <div v-if="toolsFolded" class="app-entity-list__tool" data-testid="entity-list-more">
        <VMenu location="bottom end">
          <template #activator="{ props: menuProps }">
            <span ref="moreAnchorRef" class="app-entity-list__more-anchor">
              <VBadge dot color="primary" :model-value="activeFilterCount > 0">
                <AppButton
                  v-bind="menuProps"
                  icon
                  variant="flat"
                  size="large"
                  class="app-entity-list__more app-entity-list__add--no-border"
                  :aria-label="t('app.common.moreActions')"
                >
                  <AppIcon name="dots-vertical" class="app-entity-list__icon" />
                </AppButton>
              </VBadge>
            </span>
          </template>
          <VList density="comfortable" class="app-entity-list__more-menu">
            <VListItem data-testid="entity-list-more-filter" @click="filterBarRef?.open()">
              <template #prepend><AppIcon name="filter" class="app-entity-list__icon" /></template>
              <VListItemTitle>{{ t(i18n.filtersTitle) }}</VListItemTitle>
              <template v-if="activeFilterCount > 0" #append>
                <span class="app-entity-list__more-count">{{ activeFilterCount }}</span>
              </template>
            </VListItem>
            <VListItem v-if="activeFilterCount > 0" data-testid="entity-list-more-clear" @click="onFiltersClear">
              <template #prepend><AppIcon name="close" class="app-entity-list__icon" /></template>
              <VListItemTitle>{{ t(i18n.filtersClear) }}</VListItemTitle>
            </VListItem>
            <VListItem v-if="showAddButton" data-testid="entity-list-more-add" @click="$emit('add')">
              <template #prepend><AppIcon name="plus" class="app-entity-list__icon" /></template>
              <VListItemTitle>{{ t(i18n.add) }}</VListItemTitle>
            </VListItem>
          </VList>
        </VMenu>
      </div>
    </div>
    </Teleport>

    <AppInlineAlert
      v-if="isOffline"
      type="warning"
      class="app-entity-list__offline-banner"
      :text="t('app.common.offlineShowingCached')"
    />

    <!-- One element at a time (error / empty / skeleton / list), cross-faded
         so the list never pops in or snaps between states. -->
    <Transition name="app-entity-list-swap" mode="out-in">
    <div v-if="loadError" key="error" class="app-entity-list__error-wrap">
      <AppErrorState
        :error="loadFailure"
        :subtitle="loadError"
        :refresh-label="t('app.errorState.refresh')"
        :loading="loading"
        @refresh="loadData"
      />
    </div>

    <div v-else-if="isTrulyEmpty" key="empty" class="app-entity-list__empty-wrap">
      <AppEmptyState
        :title="t(i18n.emptyTitle)"
        :subtitle="t(i18n.emptySubtitle)"
        :show-add-button="showAddButton"
        :add-label="t(i18n.add)"
        @add="$emit('add')"
      />
    </div>

    <!-- First load: quiet skeleton rows in the same shape the data will take,
         so the list fills in instead of a spinner swapping for a table.
         NEO-152, desktop: it carries the table's header row (its rule, same
         40 px) and the same 52 px rows at the same bleed, so the green rule
         stays exactly where it is when the real rows arrive. -->
    <div
      v-else-if="isInitialLoading"
      key="skeleton"
      :class="['app-entity-list__skeleton', { 'app-entity-list__skeleton--mobile': mobile }]"
      role="status"
      aria-live="polite"
      :aria-label="t('layout.loader.label')"
    >
      <div v-if="!mobile" class="app-entity-list__skeleton-head" data-testid="entity-list-skeleton-head" aria-hidden="true" />
      <div v-for="n in SKELETON_ROWS" :key="n" class="app-entity-list__skeleton-row" :style="{ '--row-i': n - 1 }">
        <span class="app-entity-list__skeleton-avatar" />
        <span class="app-entity-list__skeleton-lines">
          <span class="app-entity-list__skeleton-line" />
          <span class="app-entity-list__skeleton-line app-entity-list__skeleton-line--short" />
        </span>
      </div>
    </div>

    <div
      v-else
      key="list"
      ref="tableWrapRef"
      :class="[
        'app-entity-list__table-wrap',
        {
          'app-entity-list__table-wrap--flat': mobile,
          'app-entity-list__table-wrap--fit': !mobile,
          'app-entity-list__table-wrap--busy': isRefreshing,
          'app-entity-list__table-wrap--from-skeleton': skeletonWasShown,
        },
      ]"
      :style="mobile ? undefined : { '--entity-list-top': `${tableTop}px` }"
    >
      <!-- No rows at all → only the message, never an empty table body.
           Stays up while a follow-up search is still loading, so typing into
           a search that already matched nothing doesn't flash the table. -->
      <div
        v-if="total === 0 && hasActiveFiltersOrSearch"
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
          :headers="tableHeaders"
          :items="items"
          :items-length="total"
          :item-value="itemValue"
          class="app-entity-list__table"
          fixed-header
          hover
          :row-props="tableRowProps"
          @update:options="onOptionsUpdate"
        >
          <template v-for="(_, name) in $slots" :key="name" #[name]="slotData">
            <slot :name="name" v-bind="slotData" />
          </template>
          <template v-if="$slots['feed-card-actions']" #item.actions="{ item }">
            <div class="app-entity-list__table-actions" @click.stop>
              <slot name="feed-card-actions" :item="item" />
            </div>
          </template>
        </VDataTableServer>
        <div
          v-show="mobile"
          ref="feedScrollRef"
          class="app-entity-list__feed-scroll"
          @scroll="onFeedScroll"
          @pointerdown.capture="onFeedPointerDown"
          @click.capture="onFeedClickCapture"
        >
          <TransitionGroup name="list-stagger" tag="div" class="app-entity-list__feed">
            <VCard
              v-for="(item, index) in mobileItems"
              :key="(item as Record<string, unknown>)[itemValue]"
              variant="flat"
              elevation="0"
              :class="[
                'app-entity-list__card',
                'app-entity-list__card--clickable',
                { 'app-entity-list__card--disabled': isOtherItemLoading(item) },
              ]"
              :style="{ '--stagger-delay': `${index * 40}ms` }"
              :data-page-hero-key="heroKey(item)"
              @click="onRowClick(item)"
            >
              <div class="app-entity-list__card-body">
                <div v-if="$slots['feed-card-avatar']" class="app-entity-list__card-avatar">
                  <slot name="feed-card-avatar" :item="item" />
                </div>
                <div class="app-entity-list__card-main">
                  <div class="text-body-large font-weight-medium app-entity-list__card-title" data-page-hero-name>
                    <slot name="feed-card-title" :item="item">
                      {{ getCell(item, titleKey) }}
                    </slot>
                  </div>
                  <div v-if="metaKeys.length" class="text-body-small text-medium-emphasis app-entity-list__card-meta">
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
            <AppInlineAlert
              v-if="!loading && mobileItems.length === 0"
              key="_empty"
              type="info"
              class="app-entity-list__feed-empty"
            >
              {{ t(i18n.tableNoResults) }}
            </AppInlineAlert>
            <div v-if="mobileHasMore" key="_load-more" ref="loadMoreSentinelRef" class="app-entity-list__load-more">
              <AppSpinner v-if="loadingMore" size="24" width="2" />
            </div>
          </TransitionGroup>
        </div>
      </template>
    </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
import { useDisplay } from "vuetify";
import { useI18n } from "vue-i18n";
import { useElementBounding, useIntersectionObserver, useWindowScroll } from "@vueuse/core";
import AppButton from "./AppButton.vue";
import AppEmptyState from "./AppEmptyState.vue";
import AppErrorState from "./AppErrorState.vue";
import AppIcon from "./AppIcon.vue";
import AppFilterBar from "./AppFilterBar.vue";
import AppSpinner from "./AppSpinner.vue";
import { useEntityList } from "../composables/useEntityList";
import type { FilterDefinition } from "../composables/useFilters";
import { usePageHeaderTeleport, usePageHeaderRow } from "../composables/usePageHeader";
import { useHeaderToolsFold } from "../composables/useHeaderToolsFold";
import { useCompactSearch } from "../composables/useCompactSearch";
import { listCountKey, type ListCountNoun } from "../utils/listCountLabel";
import { AppInlineAlert } from "@ui";

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
  /** What the count under the title names ("8 patients"); without it, "8 records" (NEO-152). */
  countNoun?: ListCountNoun;
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
    /** Optional extra query params for the detail-route push (e.g. deep-linking into a specific tab). */
    detailRouteQuery?: (item: Record<string, unknown>) => Record<string, string>;
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

const { t, locale } = useI18n();
const { mobile } = useDisplay();
const pageHeader = usePageHeaderTeleport();
const slots = useSlots();

/* The mobile card feed's kebab menu (`feed-card-actions`) has no desktop
   equivalent unless a header column exists for it to render into — Vuetify's
   VDataTableServer only produces a column per `headers` entry, it doesn't
   infer one from a slot. Appending this synthetic column (only when the
   caller actually supplies that slot) is what makes the same menu content
   show up on both layouts instead of just the mobile one. */
const tableHeaders = computed<AppEntityListHeader[]>(() =>
  slots["feed-card-actions"] ? [...props.headers, { title: "", key: "actions", sortable: false }] : props.headers,
);



const {
  searchQuery, filterState, activeFilterCount, tableOptions,
  loading, clearingSearch, clearingFilters, loadError, loadFailure, isOffline, items, total,
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
  detailRouteQuery: props.detailRouteQuery,
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

const searchFieldRef = ref<{ focus: () => void; $el?: unknown } | null>(null);
/* Phone toolbar (NEO-85): three icons at rest; focusing search grows it over
   the whole row while filter/add step aside, and blurring brings them back
   (a non-empty query then stays on the left as a quiet pill). */
const searchFocused = ref(false);

/* NEO-113, phones: the toolbar shares the header row with the module title.
   An open search (or a kept query) takes the whole row, title included;
   otherwise Filter / + / clear-all fold into "⋯" whenever the title would be
   cut (useHeaderToolsFold). */
const headerRow = usePageHeaderRow();
const inHeader = computed(() => !pageHeader.disabled.value);
const inPhoneHeader = computed(() => mobile.value && inHeader.value);
const toolbarRef = ref<HTMLElement | null>(null);
const moreAnchorRef = ref<HTMLElement | null>(null);
const filterBarRef = ref<{ open: () => void } | null>(null);
const searchSlotRef = ref<HTMLElement | null>(null);

/* NEO-152, desktop: the search field yields to the list's title (and its
   subtitle) — once less than 400 px is left for it, it becomes its icon,
   like on phones (useCompactSearch). */
const { compact: desktopCompact } = useCompactSearch(
  headerRow.title,
  toolbarRef,
  () => searchSlotRef.value,
  computed(() => !mobile.value && inHeader.value),
);
const compactSearch = computed(() => mobile.value || desktopCompact.value);

/* NEO-152 "opens in place": an icon-only search in the page header opens as
   an overlay over the whole row — its clip grows from the icon's circle —
   while the title and the other tools only fade. Nothing in the row changes
   size, so there is no layout work per frame and no jump (the old version
   grew the field's flex-basis and took the title out of the layout). */
const overlayMode = computed(() => compactSearch.value && inHeader.value);
const searchWanted = computed(() => searchFocused.value || !!searchQuery.value.trim());
const overlayOpen = ref(false);
const OVERLAY_EASE = "cubic-bezier(0.2, 0, 0, 1)";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Plays the overlay's clip from the icon's circle to the full row (or back). */
function playOverlay(direction: "open" | "close"): Promise<void> {
  const field = searchFieldRef.value?.$el;
  const slot = searchSlotRef.value;
  const row = toolbarRef.value?.closest<HTMLElement>(".layout-page-header");
  if (!(field instanceof HTMLElement) || !slot || !row || typeof field.animate !== "function" || prefersReducedMotion()) {
    return Promise.resolve();
  }
  const r = row.getBoundingClientRect();
  const s = slot.getBoundingClientRect();
  const icon = `inset(0px ${Math.max(0, r.right - s.right)}px 0px ${Math.max(0, s.left - r.left)}px round 24px)`;
  const full = "inset(0px 0px 0px 0px round 24px)";
  const frames = direction === "open" ? [{ clipPath: icon }, { clipPath: full }] : [{ clipPath: full }, { clipPath: icon }];
  const animation = field.animate(frames, { duration: direction === "open" ? 320 : 240, easing: OVERLAY_EASE });
  return animation.finished.then(() => undefined, () => undefined);
}

watch(
  [searchWanted, overlayMode],
  async ([wanted, mode]) => {
    if (!mode) {
      overlayOpen.value = false;
      return;
    }
    if (wanted && !overlayOpen.value) {
      overlayOpen.value = true;
      await nextTick();
      await playOverlay("open");
    } else if (!wanted && overlayOpen.value) {
      await playOverlay("close");
      if (!searchWanted.value) overlayOpen.value = false;
    }
  },
);

/* NEO-113/152: while the overlay is open AppLayout fades the title (its space
   stays, so the row keeps its size). Off-header phone lists keep the old
   in-row growth. */
const searchTakesRow = computed(() => (overlayMode.value ? overlayOpen.value : false));
watch(searchTakesRow, (v) => (headerRow.searchTakesRow.value = v), { immediate: true });
onBeforeUnmount(() => (headerRow.searchTakesRow.value = false));
const { folded: headerFolded } = useHeaderToolsFold(headerRow.title, toolbarRef, inPhoneHeader, searchTakesRow);
const toolsFolded = computed(() => inPhoneHeader.value && headerFolded.value);

/* NEO-152: the record count under the list's title (desktop; AppLayout
   leaves it out on phones). "" while the first page loads keeps the line's
   height, so the title doesn't move when the number arrives. */
let ownSubtitle: string | null = null;
watch(
  [inHeader, total, hasCompletedInitialLoad, locale, hasActiveFiltersOrSearch, () => props.i18n.countNoun],
  () => {
    if (!inHeader.value) return;
    // "8 patients" — or "3 patients · filtered" while a search or filter
    // narrows the list, so the number is never read as the whole list.
    const count = t(listCountKey(total.value, String(locale.value), props.i18n.countNoun), { count: total.value });
    ownSubtitle = hasCompletedInitialLoad.value
      ? hasActiveFiltersOrSearch.value ? `${count} · ${t("app.list.filtered")}` : count
      : "";
    headerRow.subtitle.value = ownSubtitle;
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  // The next list may already have written its own line — only clear ours.
  if (inHeader.value && headerRow.subtitle.value === ownSubtitle) headerRow.subtitle.value = null;
});

/* NEO-160, phone feed: while the search is focused (keyboard up), the first
   tap anywhere in the feed only leaves the search — keyboard closes, the list
   stays — and the next tap opens the card. The state is read on pointerdown,
   because by the time `click` fires the browser may already have moved focus
   off the input. Captured on the feed, so a card's own handlers (open, "⋯"
   menu) never see the dismissing tap. */
let tapDismissesSearch = false;

function onFeedPointerDown() {
  tapDismissesSearch = mobile.value && searchFocused.value;
}

function onFeedClickCapture(e: MouseEvent) {
  if (!tapDismissesSearch) return;
  tapDismissesSearch = false;
  e.preventDefault();
  e.stopPropagation();
  blurSearch();
}

function blurSearch() {
  const el = searchFieldRef.value?.$el;
  const input = el instanceof HTMLElement ? el.querySelector("input") : null;
  input?.blur();
}

function onSearchClearClick() {
  onSearchClear();
  searchFieldRef.value?.focus();
}

/* NEO-130, desktop: the table never grows past the bottom of the screen — its
   rows scroll inside, under the sticky column headers, with the pagination
   footer always in view. CSS caps it at 100dvh minus this: the wrap's
   distance from the top of the page (not of the viewport, so scrolling the
   page doesn't change it). */
const tableWrapRef = ref<HTMLElement | null>(null);
const { top: tableWrapViewportTop } = useElementBounding(tableWrapRef);
const { y: windowScrollY } = useWindowScroll();
const tableTop = computed(() => Math.max(0, Math.round(tableWrapViewportTop.value + windowScrollY.value)));

const itemValue = "id";
/* Only the very first load for this view (nothing fetched yet) shows the
   full-page skeleton. A search/filter-triggered reload sets `loading` too,
   but items/total stay at their previous values until the response lands —
   gating on items.length===0 here used to also catch "search already
   matched nothing, now typing more" and tear down the toolbar + swap in the
   skeleton mid-keystroke, which flashed away the very input being typed
   into. */
const isInitialLoading = computed(() => loading.value && !hasCompletedInitialLoad.value);
/* NEO-152: rows that replace the skeleton fill in where they stand — the list
   itself doesn't fade or rise in after it (that nudge moved the header rule). */
const skeletonWasShown = ref(false);
watch(isInitialLoading, (v) => { if (v) skeletonWasShown.value = true; }, { immediate: true });
/* Any reload after the first one (search, filter, page, sort): the current
   rows stay in place and dim until the new ones land, instead of the table
   being torn down. */
const isRefreshing = computed(() => loading.value && hasCompletedInitialLoad.value);
const SKELETON_ROWS = 10;

/* Row index as a CSS variable drives the staggered row entrance
   (AppEntityList.css, app-entity-list-row-in); capped so a long page doesn't
   take seconds to finish arriving. */
function tableRowProps(data: { item: Record<string, unknown>; index: number }) {
  return { ...rowProps(data), "data-page-hero-key": heroKey(data.item), style: { "--row-i": Math.min(data.index, 10) } };
}
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

/* NEO-97: marks the row whose avatar + name fly into the record header
   (router/pageTransitionHero.ts) — the id the detail route is opened with. */
function heroKey(item: unknown): string | undefined {
  const id = (item as Record<string, unknown>)[props.detailRouteParam];
  return props.detailRouteName && id != null ? String(id) : undefined;
}

function isItemLoading(item: unknown): boolean {
  return props.loadingItemId != null && rawItemId(item) === props.loadingItemId;
}

function isOtherItemLoading(item: unknown): boolean {
  return props.loadingItemId != null && rawItemId(item) !== props.loadingItemId;
}
</script>

<style scoped src="./AppEntityList.css" />
