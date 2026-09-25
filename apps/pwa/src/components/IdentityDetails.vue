<template>
  <span v-if="details.length || more.length" class="identity-details">
    <!-- "+N" belongs to the first value (a doctor's first specialty), so it
         sits right after it — "Dentist +1 · Clínica Dental Polanco" — not at
         the end of the line where it would read as belonging to the clinic. -->
    <span v-if="details[0]">{{ details[0] }}</span>
    <VTooltip v-if="more.length" location="bottom">
      <template #activator="{ props: tooltipProps }">
        <span v-bind="tooltipProps" class="identity-details__more" tabindex="0">+{{ more.length }}</span>
      </template>
      <span>{{ more.join(", ") }}</span>
    </VTooltip>
    <span v-if="details.length > 1">· {{ details.slice(1).join(" · ") }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * The quiet line under a large identity's name (NEO-57): plain muted text,
 * no labels, no chips — "F · 47 y" for a patient, "Dentist" for a doctor,
 * "Clinic" for an organization. When there are more values than the first
 * (a doctor's second specialty) they collapse into a "+N" with the full
 * list in a tooltip.
 */
withDefaults(
  defineProps<{
    details: string[];
    more?: string[];
  }>(),
  { more: () => [] },
);
</script>

<style scoped>
.identity-details {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: 0.78125rem;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.identity-details__more {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
</style>
