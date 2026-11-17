<template>
  <!-- Phone: one status per screen under a tab bar that stays in view; a sideways swipe on the
       list moves to the next status. Empty statuses get no tab. -->
  <div v-if="layout === 'tabs'" class="work-columns__tabbed">
    <div class="work-columns__tabs" role="tablist" :aria-label="t('workBoard.tabs.label')" data-testid="work-board-tabs">
      <button
        v-for="status in filledColumns"
        :key="status"
        type="button"
        role="tab"
        class="work-columns__tab"
        :class="{ 'work-columns__tab--active': status === activeTab }"
        :aria-selected="status === activeTab"
        :data-testid="`work-tab-${status}`"
        @click="selectTab(status)"
      >
        <WorkStatusGlyph :status="status" />{{ t(`workBoard.status.${status}`) }} <span class="work-columns__count">{{ grouped[status].length }}</span>
      </button>
    </div>
    <div class="work-columns__group work-columns__panel" role="tabpanel" data-testid="work-board-list" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <template v-if="activeTab">
        <WorkItemCard
          v-for="item in shown(activeTab)"
          :key="item.id"
          :item="item"
          :draggable="false"
          @open="(key) => emit('open', key)"
          @move="(key, step) => emit('move', key, step)"
          @label="(name) => emit('label', name)"
        />
        <button v-if="hiddenCount(activeTab)" type="button" class="work-columns__more" @click="showAllDone = true">
          {{ t("workBoard.showMore", { count: hiddenCount(activeTab) }) }}
        </button>
      </template>
    </div>
  </div>

  <!-- Phone, inside a label's lane: one list grouped by status; empty statuses are left out. -->
  <div v-else-if="layout === 'list'" class="work-columns__list" data-testid="work-board-list">
    <section v-for="status in filledColumns" :key="status" class="work-columns__group">
      <h2 class="work-columns__heading">
        <WorkStatusGlyph :status="status" />{{ t(`workBoard.status.${status}`) }} <span class="work-columns__count">{{ grouped[status].length }}</span>
      </h2>
      <WorkItemCard
        v-for="item in shown(status)"
        :key="item.id"
        :item="item"
        :draggable="false"
        @open="(key) => emit('open', key)"
        @move="(key, step) => emit('move', key, step)"
        @label="(name) => emit('label', name)"
      />
      <button v-if="hiddenCount(status)" type="button" class="work-columns__more" @click="showAllDone = true">
        {{ t("workBoard.showMore", { count: hiddenCount(status) }) }}
      </button>
    </section>
  </div>

  <!-- Desktop: kanban columns; drag a card or focus it and press [ / ]. A status with no
       tickets folds into a narrow strip that still takes a drop (CORE-221). -->
  <div v-else class="work-columns" :class="{ 'work-columns--lane': lane }" data-testid="work-board-columns">
    <section
      v-for="status in columns"
      :key="status"
      class="work-columns__column"
      :class="{ 'work-columns__column--over': dropTarget === status, 'work-columns__column--empty': !lane && !grouped[status].length }"
      :data-testid="`work-column-${status}`"
      @dragover.prevent="dropTarget = status"
      @dragleave="dropTarget = dropTarget === status ? null : dropTarget"
      @drop.prevent="onDrop($event, status)"
    >
      <h2 class="work-columns__heading">
        <WorkStatusGlyph :status="status" />{{ t(`workBoard.status.${status}`) }} <span class="work-columns__count">{{ grouped[status].length }}</span>
      </h2>
      <div class="work-columns__cards">
        <WorkItemCard
          v-for="item in shown(status)"
          :key="item.id"
          :item="item"
          @open="(key) => emit('open', key)"
          @move="(key, step) => emit('move', key, step)"
          @label="(name) => emit('label', name)"
        />
        <button v-if="hiddenCount(status)" type="button" class="work-columns__more" data-testid="work-board-more" @click="showAllDone = true">
          {{ t("workBoard.showMore", { count: hiddenCount(status) }) }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import WorkItemCard from "./WorkItemCard.vue";
import WorkStatusGlyph from "./WorkStatusGlyph.vue";
import { WORK_BOARD_COLUMNS, groupByStatus } from "../../composables/useWorkBoard";
import type { WorkItem, WorkStatus } from "../../types/workBoard";

/**
 * The status columns for one set of items (CORE-219): the whole board in Priority order, or one
 * label's lane (`lane`) in Label order. A lane leaves the sideways scroll to the board, keeps
 * its columns short and never folds an empty one, so the lanes' columns line up. `canceled` adds
 * the Canceled column (CORE-221). A drop only ever asks for a status change. On a phone the
 * board is `tabs` (one status at a time) and a lane is a `list` grouped by status.
 */
const props = defineProps<{ items: readonly WorkItem[]; layout: "columns" | "list" | "tabs"; lane?: boolean; canceled?: boolean }>();
const emit = defineEmits<{
  open: [key: string];
  move: [key: string, step: -1 | 1];
  drop: [key: string, status: WorkStatus];
  label: [name: string];
}>();
const { t } = useI18n();

const grouped = computed(() => groupByStatus(props.items));
const columns = computed<readonly WorkStatus[]>(() => (props.canceled ? [...WORK_BOARD_COLUMNS, "canceled"] : WORK_BOARD_COLUMNS));
const filledColumns = computed(() => columns.value.filter((status) => grouped.value[status].length));
const dropTarget = ref<WorkStatus | null>(null);

/** Done keeps growing (all of Linear's history lands there), so it shows the newest few until asked. */
const DONE_PREVIEW = 20;
const showAllDone = ref(false);
function shown(status: WorkStatus): WorkItem[] {
  const list = grouped.value[status];
  return status === "done" && !showAllDone.value ? list.slice(0, DONE_PREVIEW) : list;
}
function hiddenCount(status: WorkStatus): number {
  return grouped.value[status].length - shown(status).length;
}

/** The tab the phone shows; one a filter has emptied gives way to the first that still has tickets. */
const chosenTab = ref<WorkStatus | null>(null);
const activeTab = computed(() =>
  chosenTab.value && filledColumns.value.includes(chosenTab.value) ? chosenTab.value : (filledColumns.value[0] ?? null),
);
/** How far the page was scrolled in each tab, so coming back lands where it was left. */
const scrolls = new Map<WorkStatus, number>();
function selectTab(status: WorkStatus): void {
  if (status === activeTab.value) return;
  if (activeTab.value) scrolls.set(activeTab.value, window.scrollY);
  chosenTab.value = status;
  void nextTick(() => window.scrollTo({ top: scrolls.get(status) ?? 0 }));
}

/** A swipe counts from this far sideways, and only when it is clearly more sideways than vertical. */
const SWIPE_MIN = 48;
let touchFrom: { x: number; y: number } | null = null;
function onTouchStart(event: TouchEvent): void {
  const point = event.touches[0];
  touchFrom = point ? { x: point.clientX, y: point.clientY } : null;
}
function onTouchEnd(event: TouchEvent): void {
  const point = event.changedTouches[0];
  const from = touchFrom;
  touchFrom = null;
  if (!point || !from || !activeTab.value) return;
  const dx = point.clientX - from.x;
  const dy = point.clientY - from.y;
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 2 * Math.abs(dy)) return;
  const next = filledColumns.value[filledColumns.value.indexOf(activeTab.value) + (dx < 0 ? 1 : -1)];
  if (next) selectTab(next);
}

function onDrop(event: DragEvent, status: WorkStatus): void {
  dropTarget.value = null;
  const key = event.dataTransfer?.getData("text/plain");
  if (key) emit("drop", key, status);
}
</script>

<style scoped>
.work-columns {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 12px;
}

/* Lanes scroll together, so the board owns the scrollbar. */
.work-columns--lane {
  overflow-x: visible;
  padding-bottom: 0;
}

.work-columns__column {
  display: flex;
  flex: 1 0 240px;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 240px;
  padding: 8px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border: 1px dashed transparent;
  border-radius: 12px;
}

.work-columns--lane .work-columns__column {
  min-height: 96px;
}

.work-columns__column--over {
  border-color: rgb(var(--v-theme-primary));
}

/* No tickets: a strip wide enough to read the name sideways and to drop a card on. */
.work-columns__column--empty {
  flex: 0 0 40px;
  align-items: center;
  padding: 8px 4px;
}

.work-columns__column--empty .work-columns__heading {
  writing-mode: vertical-rl;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-columns__column--empty .work-columns__count {
  display: none;
}

.work-columns__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.work-columns__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 4px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.work-columns__count {
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-columns__more {
  padding: 8px;
  font: inherit;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: 0;
  cursor: pointer;
}

.work-columns__tabbed {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* Stays under the app bar while the list scrolls; scrolls sideways when the statuses don't fit. */
.work-columns__tabs {
  position: sticky;
  top: var(--v-layout-top, 0px);
  z-index: 2;
  display: flex;
  overflow-x: auto;
  background: rgb(var(--v-theme-background));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  scrollbar-width: none;
}

.work-columns__tab {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  font: inherit;
  font-size: 0.875rem;
  line-height: 44px;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.work-columns__tab--active {
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  border-bottom-color: rgb(var(--v-theme-primary));
}

.work-columns__tab:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

/* Tall enough that a swipe has somewhere to land when the status holds one card. */
.work-columns__panel {
  min-height: 50vh;
}

.work-columns__list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.work-columns__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
