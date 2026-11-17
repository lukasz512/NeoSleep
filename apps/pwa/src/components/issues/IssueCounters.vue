<template>
  <div class="issue-counters">
    <div class="issue-counters__tiles">
      <button
        v-for="bucket in ISSUE_BUCKETS"
        :key="bucket"
        type="button"
        class="issue-counters__tile"
        :class="{ 'issue-counters__tile--active': modelValue === bucket }"
        :aria-pressed="modelValue === bucket"
        :data-testid="`issue-counter-${bucket}`"
        @click="emit('update:modelValue', modelValue === bucket ? 'active' : bucket)"
      >
        <span class="issue-counters__number">{{ counts[bucket] }}</span>
        <span class="issue-counters__label">{{ t(`issues.counter.${bucket}`) }}</span>
      </button>
    </div>
    <button
      type="button"
      class="issue-counters__all"
      data-testid="issue-counter-all"
      @click="emit('update:modelValue', modelValue === 'all' ? 'active' : 'all')"
    >
      {{ modelValue === "all" ? t("issues.counter.showOpen") : t("issues.counter.showAll", { count: total }) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ISSUE_BUCKETS, type IssueBucket, type IssueFilter } from "../../utils/issueState";

/**
 * The four counters above an issue list. Tapping one narrows the list to it, tapping it
 * again returns to everything still open; "Show all" adds old and dismissed rows.
 */
defineProps<{
  modelValue: IssueFilter;
  counts: Record<IssueBucket, number>;
  /** Every row loaded, whatever its state. */
  total: number;
}>();

const emit = defineEmits<{ "update:modelValue": [value: IssueFilter] }>();

const { t } = useI18n();
</script>

<style scoped>
.issue-counters {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.issue-counters__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.issue-counters__tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 64px;
  padding: 12px;
  font: inherit;
  color: inherit;
  text-align: start;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.issue-counters__tile:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.issue-counters__tile--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.issue-counters__tile:focus-visible,
.issue-counters__all:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.issue-counters__number {
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.issue-counters__label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.issue-counters__all {
  min-height: 32px;
  padding: 0 4px;
  font: inherit;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: 0;
  cursor: pointer;
}

@media (max-width: 599px) {
  .issue-counters__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
