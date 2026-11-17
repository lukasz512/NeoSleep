<template>
  <div class="work-view" :class="{ 'work-view--touch': touch }">
    <AppButton
      v-if="outOfStepCount || outOfStepOnly"
      :variant="outOfStepOnly ? 'tonal' : 'text'"
      :color="outOfStepOnly ? 'primary' : undefined"
      :prepend-icon="outOfStepOnly ? 'mdi-check' : 'mdi-source-branch-remove'"
      :aria-pressed="outOfStepOnly"
      :title="t('workBoard.outOfStepHint')"
      class="work-view__item"
      data-testid="work-board-out-of-step"
      @click="outOfStepOnly = !outOfStepOnly"
    >
      {{ t("workBoard.outOfStep", { count: outOfStepCount }) }}
    </AppButton>
    <AppButton
      v-if="canceledCount || showCanceled"
      :variant="showCanceled ? 'tonal' : 'text'"
      :color="showCanceled ? 'primary' : undefined"
      :prepend-icon="showCanceled ? 'mdi-check' : 'mdi-cancel'"
      :aria-pressed="showCanceled"
      class="work-view__item"
      data-testid="work-board-canceled"
      @click="showCanceled = !showCanceled"
    >
      {{ t("workBoard.showCanceled", { count: canceledCount }) }}
    </AppButton>
    <AppButton
      :variant="dense ? 'tonal' : 'text'"
      :color="dense ? 'primary' : undefined"
      :prepend-icon="dense ? 'mdi-check' : 'mdi-view-headline'"
      :aria-pressed="dense"
      class="work-view__item"
      data-testid="work-board-density"
      @click="dense = !dense"
    >
      {{ t("workBoard.density.compact") }}
    </AppButton>

    <div class="work-view__sort">
      <span id="work-board-sort-caption" class="work-view__caption">{{ t("workBoard.sort.label") }}</span>
      <AppSegmentedTabs
        :model-value="sort"
        :options="sortOptions"
        fit
        :compact="!touch"
        aria-labelledby="work-board-sort-caption"
        data-testid="work-board-sort"
        @update:model-value="(value: string) => (sort = value === 'label' ? 'label' : 'priority')"
      />
    </div>

    <AppButton
      v-if="hasLabels"
      variant="text"
      prepend-icon="mdi-pencil-outline"
      class="work-view__item"
      data-testid="work-board-edit-labels"
      @click="emit('edit-labels')"
    >
      {{ t("workBoard.labels.edit") }}
    </AppButton>
    <AppButton
      variant="text"
      prepend-icon="mdi-key-variant"
      class="work-view__item work-view__tokens"
      :aria-label="tokensText"
      data-testid="work-board-tokens"
      @click="emit('tokens')"
    >
      {{ t("workBoard.tokens.open") }}
      <template v-if="tokenCount !== null" #append>
        <span class="work-view__count" data-testid="work-board-token-count">{{ tokenCount }}</span>
      </template>
    </AppButton>
    <p v-if="!touch" class="work-view__hint">{{ t("workBoard.shortcuts") }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";
import AppButton from "../AppButton.vue";
import type { WorkBoardSort } from "../../types/workBoard";

/**
 * What the board's View menu holds (CORE-219 r2), and the phone's sheet under its filters: only
 * out-of-step tickets, the Canceled column, compact cards, priority order or label lanes, the
 * label catalog and the session tokens. `touch` is the sheet's version: finger-sized rows and no
 * keyboard hint.
 */
defineProps<{
  outOfStepCount: number;
  canceledCount: number;
  /** Tokens that still work; null until known. */
  tokenCount: number | null;
  tokensText: string;
  hasLabels: boolean;
  touch?: boolean;
}>();
const emit = defineEmits<{ "edit-labels": []; tokens: [] }>();
const outOfStepOnly = defineModel<boolean>("outOfStepOnly", { required: true });
const showCanceled = defineModel<boolean>("showCanceled", { required: true });
const dense = defineModel<boolean>("dense", { required: true });
const sort = defineModel<WorkBoardSort>("sort", { required: true });
const { t } = useI18n();

const sortOptions = computed(() => [
  { value: "priority", label: t("workBoard.sort.priority"), attrs: { "data-testid": "work-board-sort-priority" } },
  { value: "label", label: t("workBoard.sort.byLabel"), attrs: { "data-testid": "work-board-sort-label" } },
]);
</script>

<style scoped>
.work-view {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
}

.work-view__item {
  justify-content: flex-start;
}

.work-view--touch .work-view__item {
  min-height: 44px;
}

.work-view__sort {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}

.work-view__caption {
  padding: 0 4px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-view__count {
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-view__hint {
  margin: 0;
  padding: 8px 4px 0;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
