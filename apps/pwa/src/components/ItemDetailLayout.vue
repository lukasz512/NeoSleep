<template>
  <div class="view-item">
    <!-- NEO-56 record header (Salesforce Lightning / Veeva pattern): a tile
         with the entity's icon, the parent list as a small eyebrow link above
         the record's name, actions on the right. On desktop it replaces
         AppLayout's "← <Module>" page-header row (claimRecordHeader); on
         phones AppLayout's app bar keeps "← <Module>", so the eyebrow is
         hidden there. The name is never truncated — it is the record's identity. -->
    <header v-if="showRecordHeader" class="view-item__record-header">
      <!-- A record with an identity (NEO-57) swaps the module tile for its
           avatar via #record-tile; the module icon is the fallback. -->
      <slot v-if="hasContent && $slots['record-tile']" name="record-tile" />
      <div v-else class="view-item__tile" aria-hidden="true">
        <AppIcon v-if="tileIcon" :name="tileIcon" class="view-item__tile-icon" />
      </div>
      <div class="view-item__record-text">
        <AppBreadcrumbs v-if="parentCrumb" class="view-item__eyebrow" :items="[parentCrumb]" />
        <div class="view-item__record-title-row">
          <h1 v-if="hasContent" class="view-item__record-title">{{ recordTitle }}</h1>
          <span v-else class="view-item__record-title-skeleton" aria-hidden="true" />
          <slot v-if="hasContent" name="title-extra" />
        </div>
        <!-- NEO-57's quiet identity line under the name ("F · 47 y", "Dentist · Clinic"). -->
        <div v-if="hasContent && $slots['record-details']" class="view-item__record-details">
          <slot name="record-details" />
        </div>
      </div>
      <div v-if="hasContent && $slots['header-actions']" class="view-item__header-actions">
        <slot name="header-actions" />
      </div>
    </header>
    <!-- NEO-55 row for views without a record header (and for not-found /
         load error): the back arrow is AppLayout's ("← <Module>" in the
         desktop page header / mobile app bar); this row keeps only the view's
         own title and actions, the actions teleported up into the page header
         on desktop. -->
    <div
      v-else-if="$slots['header-title'] || $slots['header-actions']"
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
      <slot v-if="!showRecordHeader" name="title">
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
import { computed, onBeforeUnmount, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import type { RouteLocationRaw } from "vue-router";
import { AppStateView } from "@ui";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import AppLoadingState from "./AppLoadingState.vue";
import AppBreadcrumbs from "./AppBreadcrumbs.vue";
import type { BreadcrumbItem } from "./AppBreadcrumbs.types";
import type { AppIconName } from "./AppIcon.vue";
import { navTitleKey, navIconName } from "../router/routes";
import { usePageHeaderTeleport, releasePageHeaderForDescendants, useRecordHeaderClaim } from "../composables/usePageHeader";

const { t } = useI18n();

// This view's actions claim the page header; lists nested in its sections
// (e.g. OrganizationPractitionersPanel) must keep their toolbars inline.
const pageHeader = usePageHeaderTeleport();
releasePageHeaderForDescendants();

const props = withDefaults(defineProps<{
  /** Whether item data is loaded and present. */
  hasContent: boolean;
  /** Whether still loading. */
  loading: boolean;
  /** Route of the parent list: the record header's eyebrow link, and the not-found state's "back to list" button. */
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
  /**
   * The record's display name (NEO-56). When set, the header becomes the
   * record header — module tile, parent eyebrow link, this name as the h1 —
   * instead of the back-arrow row. Pass it even while loading (empty is
   * fine): the header then holds a placeholder so nothing jumps.
   */
  recordTitle?: string;
  /** Tile icon override — e.g. the org-type icon for an HCO (NEO-18). Defaults to the module icon. */
  recordIcon?: AppIconName;
}>(), { title: "", loadError: false, recordTitle: undefined, recordIcon: undefined });

/** Parent crumb: the nav title + icon of the named back route (same as the sidebar item). */
const parentCrumb = computed<BreadcrumbItem | null>(() => {
  const route = props.backRoute;
  if (typeof route !== "object" || !("name" in route) || typeof route.name !== "string") return null;
  return {
    label: t(navTitleKey(route.name)),
    to: route,
    icon: navIconName(route.name) as AppIconName | undefined,
  };
});

const tileIcon = computed(() => props.recordIcon ?? parentCrumb.value?.icon);

const showRecordHeader = computed(
  () => !!parentCrumb.value && props.recordTitle !== undefined && (props.hasContent || props.loading),
);

// While the record header is shown it replaces AppLayout's desktop
// "← <Module>" page-header row (NEO-55) — the eyebrow link is the way back.
const recordHeaderClaim = useRecordHeaderClaim();
watchEffect(() => {
  recordHeaderClaim.value = showRecordHeader.value;
});
onBeforeUnmount(() => {
  recordHeaderClaim.value = false;
});

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
  gap: var(--space-1, 4px);
  margin-bottom: var(--space-6, 24px);
}

.view-item__header-title {
  flex: 1 1 auto;
  min-width: 0;
}

.view-item__header-actions {
  flex-shrink: 0;
  margin-left: auto;
}

/* NEO-56 record header. */
.view-item__record-header {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-6, 24px);
  /* The action buttons are 56px tall; reserving that height means the
     header doesn't grow when they appear after loading (nothing jumps). */
  min-height: 56px;
}

.view-item__tile {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 12px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  display: flex;
  align-items: center;
  justify-content: center;
}
.view-item__tile-icon {
  width: 26px;
  height: 26px;
}

.view-item__record-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}

.view-item__record-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2, 8px) var(--space-3, 12px);
  min-height: 2rem;
}

.view-item__record-title {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.2;
  font-weight: 600;
  overflow-wrap: anywhere;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-item__record-details {
  font-size: 0.875rem;
}

.view-item__record-title-skeleton {
  display: inline-block;
  width: 220px;
  max-width: 60%;
  height: 1.25rem;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
@media (prefers-reduced-motion: no-preference) {
  .view-item__record-title-skeleton {
    animation: view-item-pulse 1.4s ease-in-out infinite;
  }
  @keyframes view-item-pulse {
    50% { opacity: 0.45; }
  }
}

/* Phone (Salesforce Mobile pattern): tile + actions on the first row, the
   name on its own full-width row below — three 56px actions next to the name
   would otherwise wrap even a short name onto two lines. */
@media (max-width: 767.98px) {
  .view-item__record-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: minmax(56px, auto) auto auto;
    grid-template-areas:
      "tile . actions"
      "title title title"
      "details details details";
    align-items: center;
    column-gap: var(--space-3, 12px);
    row-gap: var(--space-3, 12px);
    min-height: 0;
  }
  .view-item__record-header .view-item__tile,
  .view-item__record-header > .app-avatar { grid-area: tile; }
  .view-item__record-header .view-item__record-text { display: contents; }
  /* AppLayout's mobile app bar already shows "← <Module>" (NEO-55). */
  .view-item__record-header .view-item__eyebrow { display: none; }
  .view-item__record-header .view-item__record-title-row { grid-area: title; }
  .view-item__record-header .view-item__record-details { grid-area: details; }
  .view-item__record-header .view-item__header-actions { grid-area: actions; }
  .view-item__tile {
    width: 40px;
    height: 40px;
    border-radius: 10px;
  }
  .view-item__tile-icon {
    width: 22px;
    height: 22px;
  }
  .view-item__record-title {
    font-size: 1.25rem;
  }
}

/* Not a visual card on purpose — no surface, no border, no inset padding: the
   entity content sits directly on the page background (same color as the rest
   of the view), aligned with the header row above it — i.e. on the same page
   gutter as lists and the "← Module" header (AppLayout's --layout-card-inset,
   NEO-55). */
.view-item__card {
  background: transparent;
  border: none;
}

.view-item__title {
  margin: 0 0 var(--space-6, 24px) 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-item__sections {
  margin: 0 0 var(--space-6, 24px) 0;
  display: grid;
  /* minmax(0, …): an implicit `auto` column grows to its widest child's
     min-content (a long e-mail, a scrolling tab row), which pushed the whole
     record 5–25px past a 360px phone screen. */
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4, 16px);
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
