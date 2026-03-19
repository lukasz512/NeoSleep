<template>
  <div class="view-item">
    <div class="view-item__header-row">
      <VBtn
        icon
        variant="flat"
        size="large"
        :to="backRoute"
        class="view-item__back-btn view-item__back-btn--no-border"
        :title="backLabel"
        :aria-label="backLabel"
      >
        <svg class="view-item__back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </VBtn>
      <div v-if="$slots['header-title']" class="view-item__header-title">
        <slot name="header-title" />
      </div>
      <div v-if="$slots['header-actions']" class="view-item__header-actions">
        <slot name="header-actions" />
      </div>
    </div>
    <slot v-if="hasContent && $slots.body" name="body" />
    <div v-else-if="hasContent" class="view-item__card">
      <slot name="title">
        <h1 v-if="title" class="view-item__title">{{ title }}</h1>
      </slot>
      <div v-if="$slots.sections" class="view-item__sections">
        <slot name="sections" />
      </div>
      <div v-if="$slots.actions" class="view-item__actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-else-if="!loading" class="view-item__empty-state">
      <p class="view-item__empty-title">{{ notFoundLabel }}</p>
      <VBtn
        icon
        variant="flat"
        size="large"
        :to="backRoute"
        class="view-item__back-btn view-item__back-btn--no-border"
        :title="backLabel"
        :aria-label="backLabel"
      >
        <svg class="view-item__back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </VBtn>
    </div>
    <div v-else class="view-item__loading">
      <VProgressLinear indeterminate color="primary" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";

defineProps<{
  /** Whether item data is loaded and present. */
  hasContent: boolean;
  /** Whether still loading. */
  loading: boolean;
  /** Route for back button. */
  backRoute: RouteLocationRaw;
  /** Label for back button. */
  backLabel: string;
  /** Optional title (used when no title slot). */
  title?: string;
  /** Label when item not found. */
  notFoundLabel: string;
}>();
</script>

<style scoped>
.view-item {
  max-width: 100%;
}

.view-item__header-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
}

.view-item__header-title {
  flex: 1 1 auto;
  min-width: 0;
}

.view-item__header-actions {
  flex-shrink: 0;
  margin-left: auto;
}

.view-item__back-btn {
  min-height: var(--rep-btn-min-height, 44px);
  min-width: var(--rep-btn-min-width, 44px);
  color: var(--rep-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity)));
}

.view-item__back-btn--no-border {
  border: none;
  box-shadow: none;
  background: transparent;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
}

.view-item__back-icon {
  width: 24px;
  height: 24px;
  display: block;
}

.view-item__card {
  padding: 24px;
  border-radius: var(--rep-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-surface), 1);
}

.view-item__title {
  margin: 0 0 20px 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-item__sections {
  margin: 0 0 24px 0;
  display: grid;
  gap: 12px 16px;
}

/* Slot content (sections) uses these classes; :deep so they apply. */
.view-item__card :deep(.view-item__row) {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  align-items: baseline;
}

.view-item__card :deep(.view-item__label) {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-item__card :deep(.view-item__value) {
  margin: 0;
  font-size: 0.9375rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-item__card :deep(.view-item__link) {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.view-item__card :deep(.view-item__link:hover) {
  text-decoration: underline;
}

.view-item__card :deep(.view-item__empty) {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.view-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.view-item__empty-state,
.view-item__loading {
  padding: 24px;
  text-align: center;
}

.view-item__empty-title {
  margin: 0 0 16px 0;
  font-size: 1.125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* Edit button: same style as filter/add (circular, no border, transparent, theme color) */
/* :deep() needed because Edit is slot content from parent; use --rep-text for reliable light/dark contrast */
.view-item__header-actions :deep(.view-item__edit-btn) {
  min-width: var(--rep-btn-min-width, 44px);
  min-height: var(--rep-btn-min-height, 44px);
  color: var(--rep-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))) !important;

  &,
  * {
    color: var(--rep-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))) !important;
  }
}

.view-item__header-actions :deep(.view-item__edit-btn--no-border) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08) !important;
  }
}

.view-item__header-actions :deep(.view-item__edit-icon) {
  width: 24px;
  height: 24px;
  display: block;
  color: var(--rep-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))) !important;
  stroke: var(--rep-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))) !important;
}

/* Schedule visit button: green (success), same shape as edit/move */
.view-item__header-actions :deep(.view-item__schedule-btn) {
  min-width: var(--rep-btn-min-width, 44px);
  min-height: var(--rep-btn-min-height, 44px);
  color: rgb(var(--v-theme-success)) !important;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;

  &:hover {
    background: rgba(var(--v-theme-success), 0.12) !important;
  }
}

.view-item__header-actions :deep(.view-item__schedule-icon) {
  width: 24px;
  height: 24px;
  display: block;
  color: rgb(var(--v-theme-success)) !important;
  stroke: rgb(var(--v-theme-success)) !important;
}
</style>
