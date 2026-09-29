<template>
  <span class="checklist-status-icon" :class="`checklist-status-icon--${status}`" role="img" :aria-label="t(`app.clinical.status.${status}`)">
    <AppIcon :name="ICON[status]" />
  </span>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import type { ChecklistStatus } from "../../composables/usePatientChecklist";

/** Estudios checklist status — the shape carries the state (never color alone): ○ missing · ⏱ waiting for the patient · ◐ partial · ✓ done. */
defineProps<{ status: ChecklistStatus }>();
const { t } = useI18n();

const ICON = {
  missing: "circle-outline",
  pending_patient: "clock",
  partial: "circle-half",
  done: "check-circle",
} as const;
</script>

<style scoped>
.checklist-status-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.checklist-status-icon :deep(svg) {
  width: 100%;
  height: 100%;
}
.checklist-status-icon--missing {
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.checklist-status-icon--pending_patient,
.checklist-status-icon--partial {
  color: rgb(var(--v-theme-warning));
}
.checklist-status-icon--done {
  color: rgb(var(--v-theme-success));
}
</style>
