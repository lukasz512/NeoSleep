<template>
  <span class="issue-state" :class="`issue-state--${state}`" :data-testid="`issue-state-${state}`">
    {{ t(`issues.state.${state}`) }}
  </span>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { IssueState } from "../../utils/issueState";

/** The one state chip of an issue row, shared by Reports and Errors (CORE-227). */
defineProps<{ state: IssueState }>();

const { t } = useI18n();
</script>

<style scoped>
.issue-state {
  --issue-state-color: var(--v-theme-on-surface);
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: 24px;
  padding: 0 8px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  color: rgb(var(--issue-state-color));
  border-radius: 999px;
  background: rgba(var(--issue-state-color), 0.12);
}

.issue-state--new {
  --issue-state-color: var(--v-theme-error);
}

.issue-state--ticket {
  --issue-state-color: var(--v-theme-info);
}

.issue-state--being_fixed {
  --issue-state-color: var(--v-theme-primary);
}

.issue-state--needs_you {
  --issue-state-color: var(--v-theme-warning);
}

.issue-state--artifact_ready,
.issue-state--done {
  --issue-state-color: var(--v-theme-success);
}

.issue-state--done,
.issue-state--dismissed {
  font-weight: 500;
  background: rgba(var(--v-theme-on-surface), 0.07);
}

.issue-state--dismissed {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
