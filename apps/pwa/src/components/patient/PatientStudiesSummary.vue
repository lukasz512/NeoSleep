<template>
  <section class="studies-summary" aria-labelledby="studies-summary-title">
    <header class="studies-summary__header">
      <h3 id="studies-summary-title" class="studies-summary__title">{{ t("app.clinical.summary.title") }}</h3>
      <span v-if="checklist" class="studies-summary__count">{{ t("app.clinical.progress", checklist.summary) }}</span>
    </header>
    <VSkeletonLoader v-if="checklistApi.loading.value && !checklist" type="chip@4" />
    <p v-else-if="checklistApi.loadError.value" class="studies-summary__error">{{ t("app.clinical.errorLoad") }}</p>
    <template v-else-if="checklist">
      <AppSegmentProgress
        class="studies-summary__bar"
        :segments="checklistSegments(checklist.items)"
        :aria-label="t('app.clinical.progress', checklist.summary)"
      />
      <ul class="studies-summary__grid">
        <li v-for="item in checklist.items" :key="item.key">
          <button type="button" class="studies-summary__item" :class="`studies-summary__item--${item.status}`" @click="emit('open', item.key)">
            <ChecklistStatusIcon :status="item.status" />
            <span class="studies-summary__label">{{ itemTitle(item) }}</span>
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AppSegmentProgress from "../AppSegmentProgress.vue";
import ChecklistStatusIcon from "../questionnaire/ChecklistStatusIcon.vue";
import { checklistSegments, usePatientChecklist, type ChecklistItem } from "../../composables/usePatientChecklist";
import { useVisiblePolling } from "../../composables/useVisiblePolling";
import { checklistItemTitle } from "../../config/questionnaires";

/**
 * "Estudios" card on the patient's Details tab (ADR-024): one status icon
 * per checklist item, so what's missing is visible without opening the
 * Estudios tab; a click jumps to that item there. Admin/doctor only (the
 * parent renders it only for those roles).
 */
const props = defineProps<{ patientId: string }>();
const emit = defineEmits<{ open: [itemKey: string] }>();
const { t } = useI18n();

const checklistApi = usePatientChecklist(() => props.patientId);
const checklist = computed(() => checklistApi.checklist.value);

function itemTitle(item: ChecklistItem): string {
  return checklistItemTitle(t, item.key, item.label);
}

onMounted(checklistApi.load);
// Stays current while the Details tab is open (NEO-173) — fingerprint check every 60 s, reload only on change.
useVisiblePolling(() => 60_000, checklistApi.refreshIfChanged);
</script>

<style scoped>
.studies-summary {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.studies-summary__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.studies-summary__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
.studies-summary__count {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.studies-summary__bar {
  margin-bottom: 12px;
}
.studies-summary__error {
  margin: 0;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-error));
}
.studies-summary__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
}
.studies-summary__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  background: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font-size: 0.8125rem;
}
.studies-summary__item:hover,
.studies-summary__item:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.studies-summary__item--done {
  background: rgba(var(--v-theme-success), 0.07);
  border-color: rgba(var(--v-theme-success), 0.35);
}
.studies-summary__label {
  line-height: 1.25;
}
</style>
