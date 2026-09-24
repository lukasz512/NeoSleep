<template>
  <span v-if="forms.length === 0" class="app-entity-list__cell-empty">—</span>
  <VTooltip v-else location="bottom">
    <template #activator="{ props: tooltipProps }">
      <span
        v-bind="tooltipProps"
        class="intake-dots"
        role="img"
        :aria-label="progressLabel"
        tabindex="0"
      >
        <span
          v-for="form in forms"
          :key="form.key"
          class="intake-dots__dot"
          :class="{ 'intake-dots__dot--done': form.done }"
        />
      </span>
    </template>
    <div class="intake-dots__tooltip">
      <div class="intake-dots__tooltip-title">{{ progressLabel }}</div>
      <ul class="intake-dots__list">
        <li v-for="form in forms" :key="form.key" class="intake-dots__item">
          <span class="intake-dots__marker" :class="{ 'intake-dots__marker--done': form.done }" />
          <span>{{ formLabel(form.key) }}</span>
          <span class="intake-dots__state">
            {{ form.done ? t("app.patients.forms.collected") : t("app.patients.forms.pending") }}
          </span>
        </li>
      </ul>
    </div>
  </VTooltip>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { documentLabelKey } from "../../utils/documentLabels";
import type { PatientIntakeFormStatus } from "../../types/patientIntakeForm";

// Order is the API's (DOCUMENT_MANIFEST order) — never re-sorted here, so
// the dots and the tooltip list line up with each other on every row.
const props = defineProps<{ forms: PatientIntakeFormStatus[] }>();

const { t } = useI18n();

const doneCount = computed(() => props.forms.filter((f) => f.done).length);
const progressLabel = computed(() =>
  t("app.patients.forms.progress", { done: doneCount.value, total: props.forms.length }),
);

function formLabel(key: string): string {
  // Same fallback as DocumentsView's documentLabel(): te() misses these flat dotted keys, so compare t()'s output instead.
  const labelKey = documentLabelKey(key);
  const translated = labelKey ? t(labelKey) : "";
  return translated && translated !== labelKey ? translated : key;
}
</script>

<style scoped>
.intake-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  border-radius: 999px;
  outline: none;
}

.intake-dots:focus-visible {
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.4);
}

/* Empty: a soft recessed well. */
.intake-dots__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.08);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.18),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06);
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
}

/* Done: filled with the brand color and a faint halo. */
.intake-dots__dot--done {
  background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.45), transparent 55%),
    rgb(var(--v-theme-primary));
  box-shadow:
    0 0 0 1px rgba(var(--v-theme-primary), 0.25),
    0 0 6px 1px rgba(var(--v-theme-primary), 0.45);
}

.intake-dots__tooltip-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.intake-dots__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.intake-dots__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}

.intake-dots__state {
  opacity: 0.7;
  font-size: 0.75rem;
}

/* Tooltip markers sit on the tooltip's own inverted surface, so they use
   currentColor rather than the theme's on-surface tint. */
.intake-dots__marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  opacity: 0.5;
}

.intake-dots__marker--done {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 5px rgba(var(--v-theme-primary), 0.7);
  opacity: 1;
}
</style>
