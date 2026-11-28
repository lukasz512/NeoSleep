<template>
  <div class="work-label-filter" :class="{ 'work-label-filter--touch': touch }">
    <WorkLabelChip
      v-for="label in labels"
      :key="label.id"
      :name="label.name"
      :color="label.color"
      clickable
      :active="isSelected(label.name)"
      :data-testid="`work-filter-option-${label.name}`"
      @click="emit('toggle', label.name)"
    />
    <p v-if="!labels.length" class="work-label-filter__empty">{{ t("workBoard.labels.empty") }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import WorkLabelChip from "./WorkLabelChip.vue";
import type { WorkLabel } from "../../types/workBoard";

/**
 * The catalog's labels as toggles (CORE-219 r2): what the Filters menu and the phone's sheet
 * list. Several selected = items that carry all of them. `touch` gives finger-sized targets.
 */
const props = defineProps<{ labels: readonly WorkLabel[]; selected: readonly string[]; touch?: boolean }>();
const emit = defineEmits<{ toggle: [name: string] }>();
const { t } = useI18n();

function isSelected(name: string): boolean {
  return props.selected.some((label) => label.toLowerCase() === name.toLowerCase());
}
</script>

<style scoped>
.work-label-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.work-label-filter--touch :deep(.work-label) {
  min-height: 44px;
  padding: 0 16px;
}

.work-label-filter__empty {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
