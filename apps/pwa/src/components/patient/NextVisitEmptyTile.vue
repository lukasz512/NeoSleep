<template>
  <button type="button" class="next-visit-empty" data-testid="tile-appointment-empty" @click="emit('book')">
    <span class="next-visit-empty__leaf" aria-hidden="true">
      <AppIcon name="calendar" class="next-visit-empty__leaf-icon" />
    </span>
    <span class="next-visit-empty__text">
      <span class="next-visit-empty__key">{{ label }}</span>
      <span class="next-visit-empty__none">{{ t("app.patients.detail.nextVisit.none") }}</span>
    </span>
    <span class="next-visit-empty__cta">
      <AppIcon name="plus" class="next-visit-empty__cta-icon" />
      {{ t("app.patients.detail.nextVisit.book") }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";

/**
 * The next-visit slot when nothing is booked (CORE-162): same place and size
 * as the visit tile, so the strip doesn't jump when one is booked. Tapping it
 * books the patient's next visit.
 */
defineProps<{ label: string }>();
const emit = defineEmits<{ book: [] }>();
const { t } = useI18n();
</script>

<style scoped>
.next-visit-empty {
  grid-column: span 2;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: var(--space-3, 12px);
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.16);
  border-radius: var(--pwa-radius, 12px);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease;
}
.next-visit-empty:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
  background: rgba(var(--v-theme-primary), 0.04);
}
/* Inset, like the other tiles: never clipped by a parent. */
.next-visit-empty:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
}

/* The leaf's outline, empty: the same spot the date takes once a visit is booked. */
.next-visit-empty__leaf {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 44px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.next-visit-empty__leaf-icon {
  width: 18px;
  height: 18px;
}

.next-visit-empty__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.next-visit-empty__key {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.next-visit-empty__none {
  overflow: hidden;
  font-size: 0.9375rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.next-visit-empty__cta {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 99px;
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}
.next-visit-empty__cta-icon {
  width: 16px;
  height: 16px;
}
</style>
