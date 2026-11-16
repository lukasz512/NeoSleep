<template>
  <!-- Phone: one list grouped by status (same data as the columns). -->
  <div v-if="layout === 'list'" class="work-columns__list" data-testid="work-board-list">
    <template v-for="status in WORK_BOARD_COLUMNS" :key="status">
      <section v-if="!lane || grouped[status].length" class="work-columns__group">
        <h2 class="work-columns__heading">
          {{ t(`workBoard.status.${status}`) }} <span class="work-columns__count">{{ grouped[status].length }}</span>
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
    </template>
  </div>

  <!-- Desktop: kanban columns; drag a card or focus it and press [ / ]. -->
  <div v-else class="work-columns" :class="{ 'work-columns--lane': lane }" data-testid="work-board-columns">
    <section
      v-for="status in WORK_BOARD_COLUMNS"
      :key="status"
      class="work-columns__column"
      :class="{ 'work-columns__column--over': dropTarget === status }"
      :data-testid="`work-column-${status}`"
      @dragover.prevent="dropTarget = status"
      @dragleave="dropTarget = dropTarget === status ? null : dropTarget"
      @drop.prevent="onDrop($event, status)"
    >
      <h2 class="work-columns__heading">
        {{ t(`workBoard.status.${status}`) }} <span class="work-columns__count">{{ grouped[status].length }}</span>
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
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import WorkItemCard from "./WorkItemCard.vue";
import { WORK_BOARD_COLUMNS, groupByStatus } from "../../composables/useWorkBoard";
import type { WorkItem, WorkStatus } from "../../types/workBoard";

/**
 * The status columns for one set of items (CORE-219): the whole board in Priority order, or one
 * label's lane (`lane`) in Label order. A lane leaves the sideways scroll to the board, keeps
 * its columns short and, on phones, skips the statuses it has nothing in. A drop only ever asks
 * for a status change.
 */
const props = defineProps<{ items: readonly WorkItem[]; layout: "columns" | "list"; lane?: boolean }>();
const emit = defineEmits<{
  open: [key: string];
  move: [key: string, step: -1 | 1];
  drop: [key: string, status: WorkStatus];
  label: [name: string];
}>();
const { t } = useI18n();

const grouped = computed(() => groupByStatus(props.items));
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

function onDrop(event: DragEvent, status: WorkStatus): void {
  dropTarget.value = null;
  const key = event.dataTransfer?.getData("text/plain");
  if (key) emit("drop", key, status);
}
</script>

<style scoped>
.work-columns {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(240px, 1fr);
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
  flex-direction: column;
  gap: 8px;
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

.work-columns__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.work-columns__heading {
  display: flex;
  align-items: baseline;
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
