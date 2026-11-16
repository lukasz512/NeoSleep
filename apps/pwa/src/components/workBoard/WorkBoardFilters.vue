<template>
  <div class="work-filters" data-testid="work-board-filters">
    <div class="work-filters__chips">
      <WorkLabelChip
        :name="t('workBoard.sessionFilter')"
        color="primary"
        clickable
        :active="sessionsOnly"
        data-testid="work-board-session-filter"
        @click="emit('update:sessionsOnly', !sessionsOnly)"
      >
        <template #icon><VIcon icon="mdi-robot-outline" size="16" aria-hidden="true" /></template>
        <span class="work-filters__count" data-testid="work-board-session-count">{{ sessionCount }}</span>
      </WorkLabelChip>
      <WorkLabelChip
        v-for="label in labels"
        :key="label.id"
        :name="label.name"
        :color="label.color"
        clickable
        :active="isSelected(label.name)"
        :data-testid="`work-filter-label-${label.name}`"
        @click="emit('toggle-label', label.name)"
      />
      <AppButton
        v-if="labels.length"
        variant="text"
        size="small"
        prepend-icon="mdi-pencil-outline"
        data-testid="work-board-edit-labels"
        @click="emit('edit-labels')"
      >
        {{ t("workBoard.labels.edit") }}
      </AppButton>
    </div>

    <div class="work-filters__view">
      <span id="work-board-sort-label" class="work-filters__caption">{{ t("workBoard.sort.label") }}</span>
      <AppSegmentedTabs
        :model-value="sort"
        :options="sortOptions"
        fit
        compact
        aria-labelledby="work-board-sort-label"
        data-testid="work-board-sort"
        @update:model-value="(value: string) => emit('update:sort', value === 'label' ? 'label' : 'priority')"
      />
      <AppButton
        variant="text"
        size="small"
        :icon="dense ? 'mdi-view-agenda-outline' : 'mdi-view-headline'"
        :aria-label="t(dense ? 'workBoard.density.full' : 'workBoard.density.compact')"
        :title="t(dense ? 'workBoard.density.full' : 'workBoard.density.compact')"
        :aria-pressed="dense"
        data-testid="work-board-density"
        @click="emit('update:dense', !dense)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";
import AppButton from "../AppButton.vue";
import WorkLabelChip from "./WorkLabelChip.vue";
import type { WorkLabel } from "../../types/workBoard";

export type WorkBoardSort = "priority" | "label";

/**
 * The board's filter row (CORE-219): "Claude sessions" first with its count, then one chip per
 * catalog label (several selected = items that carry all of them), and on the right how the
 * board is laid out: sorted by priority or split into label lanes, full or compact cards.
 */
const props = defineProps<{
  labels: readonly WorkLabel[];
  selected: readonly string[];
  sessionsOnly: boolean;
  sessionCount: number;
  sort: WorkBoardSort;
  dense: boolean;
}>();
const emit = defineEmits<{
  "update:sessionsOnly": [value: boolean];
  "update:sort": [value: WorkBoardSort];
  "update:dense": [value: boolean];
  "toggle-label": [name: string];
  "edit-labels": [];
}>();
const { t } = useI18n();

const sortOptions = computed(() => [
  { value: "priority", label: t("workBoard.sort.priority"), attrs: { "data-testid": "work-board-sort-priority" } },
  { value: "label", label: t("workBoard.sort.byLabel"), attrs: { "data-testid": "work-board-sort-label" } },
]);

function isSelected(name: string): boolean {
  return props.selected.some((label) => label.toLowerCase() === name.toLowerCase());
}
</script>

<style scoped>
.work-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.work-filters__chips {
  display: flex;
  flex: 1 1 320px;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.work-filters__count {
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-filters__view {
  display: flex;
  align-items: center;
  gap: 8px;
}

.work-filters__caption {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
