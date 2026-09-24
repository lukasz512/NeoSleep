<template>
  <div class="view-item">
    <!-- NEO-55: the back arrow is AppLayout's now ("← <Module>" in the desktop
         page header / mobile app bar, derived from the route). This row keeps
         only the view's own title and actions; on desktop the actions are
         teleported up into the page header, next to that back arrow. -->
    <div
      v-if="$slots['header-title'] || $slots['header-actions']"
      v-show="$slots['header-title'] || pageHeader.disabled.value"
      class="view-item__header-row"
    >
      <div v-if="$slots['header-title']" class="view-item__header-title">
        <slot name="header-title" />
      </div>
      <Teleport v-if="$slots['header-actions']" :to="pageHeader.to" defer :disabled="pageHeader.disabled.value">
        <div class="view-item__header-actions">
          <slot name="header-actions" />
        </div>
      </Teleport>
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
    <div v-else-if="!loading && loadError" class="view-item__state-wrap">
      <AppStateView :title="t('app.errorState.title')" :subtitle="t('app.errorState.subtitle')">
        <template #icon>
          <AppIcon name="sad-cloud" />
        </template>
        <template #cta>
          <AppButton color="primary" variant="outlined" size="large" ignore-global-loading class="view-item__state-cta" @click="$emit('retry')">
            <template #prepend>
              <AppIcon name="refresh" class="view-item__state-cta-icon" />
            </template>
            {{ t("app.errorState.refresh") }}
          </AppButton>
        </template>
      </AppStateView>
    </div>
    <div v-else-if="!loading" class="view-item__state-wrap">
      <AppStateView :title="notFoundLabel" :subtitle="t('app.common.notFoundSubtitle')">
        <template #icon>
          <AppIcon name="search" />
        </template>
        <template #cta>
          <AppButton color="primary" variant="outlined" size="large" :to="backRoute" ignore-global-loading class="view-item__state-cta">
            <template #prepend>
              <AppIcon name="arrow-left" class="view-item__state-cta-icon" />
            </template>
            {{ backLabel }}
          </AppButton>
        </template>
      </AppStateView>
    </div>
    <div v-else class="view-item__loading">
      <AppLoadingState />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { RouteLocationRaw } from "vue-router";
import { AppStateView } from "@ui";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import AppLoadingState from "./AppLoadingState.vue";
import { usePageHeaderTeleport, releasePageHeaderForDescendants } from "../composables/usePageHeader";

const { t } = useI18n();

// This view's actions claim the page header; lists nested in its sections
// (e.g. OrganizationPractitionersPanel) must keep their toolbars inline.
const pageHeader = usePageHeaderTeleport();
releasePageHeaderForDescendants();

defineProps<{
  /** Whether item data is loaded and present. */
  hasContent: boolean;
  /** Whether still loading. */
  loading: boolean;
  /** Route for the not-found state's "back to list" button (the header back arrow is AppLayout's). */
  backRoute: RouteLocationRaw;
  /** Label for the not-found state's "back to list" button. */
  backLabel: string;
  /** Optional title (used when no title slot). */
  title?: string;
  /** Label when item not found. */
  notFoundLabel: string;
  /**
   * True when the load failed for a reason other than a genuine 404 (network
   * down, 500, ...) — renders a distinct "connection problem" + retry state
   * instead of "not found", so a temporary outage never reads as "this
   * record doesn't exist". See LeadDetailView.vue's loadLead() etc. for how
   * callers set this apart from a real 404.
   */
  loadError?: boolean;
}>();

defineEmits<{
  retry: [];
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

/* Borderless and page-coloured, so it is not a visible card — no inline
   padding (NEO-55): its content (avatar, name, tabs, fields) starts on the
   same page gutter as lists and the "← Module" header above it
   (AppLayout's --layout-card-inset). Bordered cards inside views keep their
   own inner padding; their border is what sits on the gutter. */
.view-item__card {
  padding: 0 0 24px;
  border-radius: var(--pwa-radius);
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

/* Icon-led label variant (contact rows: email/phone/website/…) — the icon
   mirrors the same one FormRenderer's field.icon shows on the equivalent
   edit-form field, so the read view and the edit view agree visually. */
.view-item__card :deep(.view-item__label--icon) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.view-item__card :deep(.view-item__label--icon .app-icon) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
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

/* AppStateView (from @ui) owns the icon/title/subtitle/orbs/animation for
   both branches above — this wrapper only supplies the same full-page
   min-height the old bespoke empty state had. */
.view-item__state-wrap {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-item__state-cta {
  min-height: 44px;
  min-width: 44px;
}

.view-item__state-cta-icon {
  width: 20px;
  height: 20px;
}

.view-item__loading {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
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
