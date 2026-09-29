<template>
  <span v-if="forms.length === 0" class="app-entity-list__cell-empty">—</span>
  <VTooltip v-else location="bottom">
    <template #activator="{ props: tooltipProps }">
      <span
        v-bind="tooltipProps"
        class="intake-forms"
        role="img"
        :aria-label="progressLabel"
        tabindex="0"
      >
        <span
          v-for="form in forms"
          :key="form.key"
          class="intake-forms__tile"
          :class="{ 'intake-forms__tile--done': form.done }"
        >
          {{ formAbbr(form.key) }}
        </span>
      </span>
    </template>
    <div class="intake-forms__tooltip-title">{{ progressLabel }}</div>
    <ul class="intake-forms__list">
      <li v-for="form in forms" :key="form.key" class="intake-forms__item">
        <AppIcon :name="intakeFormIcon(form.key)" class="intake-forms__item-icon" />
        <span>{{ formLabel(form.key) }}</span>
        <span class="intake-forms__check" :class="{ 'intake-forms__check--done': form.done }">
          <svg v-if="form.done" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 6.2l2.3 2.3 4.7-5" />
          </svg>
          <span class="intake-forms__sr-only">
            {{ form.done ? t("app.patients.forms.collected") : t("app.patients.forms.pending") }}
          </span>
        </span>
      </li>
    </ul>
  </VTooltip>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import { documentLabelKey } from "../../utils/documentLabels";
import { intakeFormAbbrKey, intakeFormIcon, initialsAbbr } from "../../config/patientIntakeForms";
import type { PatientIntakeFormStatus } from "../../types/patientIntakeForm";

// Order is the API's (assigned templates in DOCUMENT_MANIFEST order, then
// polysomnography) — never re-sorted here, so the icons and the tooltip
// list line up with each other on every row.
const props = defineProps<{ forms: PatientIntakeFormStatus[] }>();

const { t } = useI18n();

const doneCount = computed(() => props.forms.filter((f) => f.done).length);
const progressLabel = computed(() =>
  t("app.patients.forms.progress", { done: doneCount.value, total: props.forms.length }),
);

/** Clinical abbreviation (CI / HE / SB / PSG), or initials of the form's label for a template without one. */
function formAbbr(key: string): string {
  const abbrKey = intakeFormAbbrKey(key);
  const translated = abbrKey ? t(abbrKey) : "";
  return translated && translated !== abbrKey ? translated : initialsAbbr(formLabel(key));
}

function formLabel(key: string): string {
  // Same fallback as DocumentsView's documentLabel(): te() misses these flat dotted keys, so compare t()'s output instead.
  const labelKey = documentLabelKey(key);
  const translated = labelKey ? t(labelKey) : "";
  return translated && translated !== labelKey ? translated : key;
}
</script>

<style scoped>
.intake-forms {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px;
  border-radius: 8px;
  outline: none;
}

.intake-forms:focus-visible {
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.4);
}

/* NEO-57: a clinical-abbreviation chip per form (CI / HE / SB / PSG).
   Pending: just a faint outline, the letters barely there — what's
   missing reads at a glance without shouting. */
.intake-forms__tile {
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.65625rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.34);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.14);
  transition: background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
}

/* Collected: brand-tinted fill, brand letters, no outline. */
.intake-forms__tile--done {
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  box-shadow: none;
}

.intake-forms__tooltip-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.intake-forms__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.intake-forms__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}

.intake-forms__item-icon {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}

/* Read-only checkbox: an empty outlined box while pending, a filled brand box with a tick once collected. */
.intake-forms__check {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid currentColor;
  opacity: 0.55;
  display: grid;
  place-items: center;
}

.intake-forms__check--done {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  opacity: 1;
}

.intake-forms__check svg {
  width: 10px;
  height: 10px;
  fill: none;
  stroke: rgb(var(--v-theme-on-primary));
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.intake-forms__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .intake-forms__tile {
    transition: none;
  }
}
</style>
