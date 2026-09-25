<template>
  <span v-if="tags.length || more.length" class="identity-tags" :class="`identity-tags--${tone}`">
    <span v-for="tag in tags" :key="tag" class="identity-tags__tag">{{ tag }}</span>
    <VTooltip v-if="more.length" location="bottom">
      <template #activator="{ props: tooltipProps }">
        <span v-bind="tooltipProps" class="identity-tags__tag identity-tags__tag--more" tabindex="0">+{{ more.length }}</span>
      </template>
      <span>{{ more.join(", ") }}</span>
    </VTooltip>
  </span>
</template>

<script setup lang="ts">
import type { IdentityTone } from "../utils/identityTone";

/**
 * The "wristband" tags under a large identity (NEO-57): short uppercase
 * values in a monospace face — [F] [47 Y] for a patient, [DENTIST] for a
 * doctor, [CLINIC] for an organization. Doctor/organization tags are tinted
 * with their identity color; patient data stays neutral (outlined), because
 * it is facts about the person, not a category. Extra values (a doctor's
 * second specialty) collapse into one "+N" tag with the full list in a
 * tooltip.
 */
withDefaults(
  defineProps<{
    tags: string[];
    more?: string[];
    tone?: IdentityTone;
  }>(),
  { more: () => [], tone: "person" },
);
</script>

<style scoped>
.identity-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.identity-tags__tag {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.65625rem;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 4px 6px;
  border-radius: 5px;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.12);
}

.identity-tags--doctor .identity-tags__tag {
  color: var(--pwa-identity-doctor);
  background: var(--pwa-identity-doctor-soft);
  box-shadow: none;
}

.identity-tags--org .identity-tags__tag {
  color: var(--pwa-identity-org);
  background: var(--pwa-identity-org-soft);
  box-shadow: none;
}

/* "+N": the same tint as its siblings, but outlined instead of filled, so it
   reads as "there's more" rather than as another value. */
.identity-tags__tag--more,
.identity-tags--doctor .identity-tags__tag--more,
.identity-tags--org .identity-tags__tag--more {
  background: transparent;
  box-shadow: inset 0 0 0 1px currentColor;
  cursor: help;
}
</style>
