<template>
  <div class="view-item">
    <div class="view-item__header-row">
      <AppButton
        icon
        variant="flat"
        size="large"
        :to="backRoute"
        class="view-item__back-btn view-item__back-btn--no-border"
        :title="backLabel"
        :aria-label="backLabel"
      >
        <AppIcon name="arrow-left" class="view-item__back-icon" />
      </AppButton>
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
      <AppButton
        icon
        variant="flat"
        size="large"
        :to="backRoute"
        class="view-item__back-btn view-item__back-btn--no-border"
        :title="backLabel"
        :aria-label="backLabel"
      >
        <AppIcon name="arrow-left" class="view-item__back-icon" />
      </AppButton>
    </div>
    <div v-else class="view-item__loading">
      <AppLoadingState />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import AppLoadingState from "./AppLoadingState.vue";

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
  min-height: var(--pwa-btn-min-height, 44px);
  min-width: var(--pwa-btn-min-width, 44px);
  color: var(--pwa-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity)));
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
  border-radius: var(--pwa-radius);
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

.view-item__empty-state {
  padding: 24px;
  text-align: center;
}

.view-item__loading {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-item__empty-title {
  margin: 0 0 16px 0;
  font-size: 1.125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/*
 * Generic header-action icon button — every header action (edit, schedule
 * visit, move to contacts, reset password, enable/disable, delete) is a
 * borderless flat icon button; only the color (tone) differs. Consumers
 * apply `view-item__action-btn view-item__action-btn--<tone>`, generated by
 * config/entityActions.ts's entityActionBtnClass() — that config is the only
 * place deciding which action gets which tone. The icon inherits its color
 * from the button via `currentColor`, so there's no separate icon color rule.
 * :deep() needed because header-actions is slot content from the parent view.
 */
.view-item__header-actions :deep(.view-item__action-btn) {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  color: var(--pwa-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))) !important;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08) !important;
  }
}

.view-item__header-actions :deep(.view-item__action-icon) {
  width: 24px;
  height: 24px;
  display: block;
  color: inherit !important;
  stroke: currentColor !important;
}

.view-item__header-actions :deep(.view-item__action-btn--success) {
  color: rgb(var(--v-theme-success)) !important;

  &:hover {
    background: rgba(var(--v-theme-success), 0.12) !important;
  }
}

.view-item__header-actions :deep(.view-item__action-btn--primary) {
  color: rgb(var(--v-theme-primary)) !important;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.12) !important;
  }
}

.view-item__header-actions :deep(.view-item__action-btn--error) {
  color: rgb(var(--v-theme-error)) !important;

  &:hover {
    background: rgba(var(--v-theme-error), 0.12) !important;
  }
}

/* Toggle-status "enable" state (the entity is currently inactive) reads as
   a muted, non-destructive action rather than the neutral default. */
.view-item__header-actions :deep(.view-item__action-btn--inactive) {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)) !important;
}
</style>
