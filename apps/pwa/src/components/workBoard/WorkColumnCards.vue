<template>
  <!-- Needs Review: what waits for a person on top, what is merged folded below (CORE-233). -->
  <template v-if="status === 'needs_review'">
    <h3 class="work-cards__group" data-testid="work-review-waiting">
      {{ t("workBoard.review.waiting") }} <span class="work-cards__count">{{ review.waiting.length }}</span>
    </h3>
    <WorkItemCard
      v-for="item in review.waiting"
      :key="item.id"
      :item="item"
      :draggable="draggable"
      @open="(key) => emit('open', key)"
      @move="(key, step) => emit('move', key, step)"
      @label="(name) => emit('label', name)"
    />
    <template v-if="review.merged.length">
      <button
        type="button"
        class="work-cards__group work-cards__fold"
        :aria-expanded="mergedOpen"
        data-testid="work-review-merged-toggle"
        @click="mergedOpen = !mergedOpen"
      >
        <VIcon :icon="mergedOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="16" aria-hidden="true" />
        {{ t("workBoard.review.merged") }} <span class="work-cards__count">{{ review.merged.length }}</span>
      </button>
      <template v-if="mergedOpen">
        <WorkItemCard
          v-for="item in review.merged"
          :key="item.id"
          :item="item"
          :draggable="draggable"
          @open="(key) => emit('open', key)"
          @move="(key, step) => emit('move', key, step)"
          @label="(name) => emit('label', name)"
        />
      </template>
    </template>
  </template>
  <!-- Backlog: what was set aside as "later" is folded below the rest (CORE-234). -->
  <template v-else-if="status === 'backlog'">
    <WorkItemCard
      v-for="item in backlog.current"
      :key="item.id"
      :item="item"
      :draggable="draggable"
      @open="(key) => emit('open', key)"
      @move="(key, step) => emit('move', key, step)"
      @label="(name) => emit('label', name)"
    />
    <template v-if="backlog.later.length">
      <button
        type="button"
        class="work-cards__group work-cards__fold"
        :aria-expanded="laterOpen"
        data-testid="work-backlog-later-toggle"
        @click="laterOpen = !laterOpen"
      >
        <VIcon :icon="laterOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="16" aria-hidden="true" />
        {{ t("workBoard.backlog.later") }} <span class="work-cards__count">{{ backlog.later.length }}</span>
      </button>
      <template v-if="laterOpen">
        <WorkItemCard
          v-for="item in backlog.later"
          :key="item.id"
          :item="item"
          :draggable="draggable"
          @open="(key) => emit('open', key)"
          @move="(key, step) => emit('move', key, step)"
          @label="(name) => emit('label', name)"
        />
      </template>
    </template>
  </template>
  <template v-else>
    <WorkItemCard
      v-for="item in shown"
      :key="item.id"
      :item="item"
      :draggable="draggable"
      @open="(key) => emit('open', key)"
      @move="(key, step) => emit('move', key, step)"
      @label="(name) => emit('label', name)"
    />
    <button v-if="hiddenCount" type="button" class="work-cards__more" data-testid="work-board-more" @click="showAllDone = true">
      {{ t("workBoard.showMore", { count: hiddenCount }) }}
    </button>
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import WorkItemCard from "./WorkItemCard.vue";
import { backlogGroups, reviewGroups } from "../../composables/useWorkBoard";
import type { WorkItem, WorkStatus } from "../../types/workBoard";

/**
 * The cards of one status, for a column, a phone tab or a list section. Needs Review comes in
 * two groups (CORE-233): "Waiting for you" (not merged, or on hold) with the longest wait
 * first, and "Merged, closes by itself", folded until asked. Backlog folds the tickets labeled
 * `later` the same way (CORE-234). Done shows its newest few.
 */
const props = withDefaults(defineProps<{ status: WorkStatus; items: readonly WorkItem[]; draggable?: boolean }>(), { draggable: true });
const emit = defineEmits<{ open: [key: string]; move: [key: string, step: -1 | 1]; label: [name: string] }>();
const { t } = useI18n();

const review = computed(() => reviewGroups(props.items));
const mergedOpen = ref(false);

const backlog = computed(() => backlogGroups(props.items));
const laterOpen = ref(false);

/** Done keeps growing (all of Linear's history lands there), so it shows the newest few until asked. */
const DONE_PREVIEW = 20;
const showAllDone = ref(false);
const shown = computed(() => (props.status === "done" && !showAllDone.value ? props.items.slice(0, DONE_PREVIEW) : props.items));
const hiddenCount = computed(() => props.items.length - shown.value.length);
</script>

<style scoped>
.work-cards__group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 4px;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: start;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-cards__fold {
  min-height: 32px;
  background: none;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.work-cards__fold:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.work-cards__count {
  margin-inline-start: 4px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.work-cards__more {
  padding: 8px;
  font: inherit;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: 0;
  cursor: pointer;
}
</style>
