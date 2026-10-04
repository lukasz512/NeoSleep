<template>
  <div ref="viewEl" class="view-item" :class="{ 'view-item--toolbar': phoneToolbar, 'view-item--collapsing': collapsing }">
    <!-- NEO-56 record header (Salesforce Lightning / Veeva pattern): a tile
         with the entity's icon, the parent list as a small eyebrow link above
         the record's name, actions on the right. On desktop it replaces
         AppLayout's "← <Module>" page-header row (claimRecordHeader); on
         phones that row stays as the card's first line (NEO-108), so the
         eyebrow is hidden there. NEO-158: the name stays on one line — it
         shrinks to fit, and only a very long one ends in "…" (useFitTitle). -->
    <!-- NEO-181, phones: the record's toolbar (‹ back, main action, ⋯) pins
         under the app bar from the start; as the page scrolls, the header
         below collapses into it (useRecordHeaderCollapse). -->
    <template v-if="phoneToolbar">
      <span ref="collapseSentinel" class="view-item__collapse-sentinel" aria-hidden="true" />
      <RecordToolbar :back="parentCrumb" :actions="headerActionsEl" :skeletons="hasContent ? 0 : actionSkeletons" />
    </template>
    <header v-if="showRecordHeader" ref="recordHeaderEl" class="view-item__record-header">
      <!-- A record with an identity (NEO-57) swaps the module tile for its
           avatar via #record-tile; the module icon is the fallback. -->
      <slot v-if="hasContent && $slots['record-tile']" name="record-tile" />
      <!-- NEO-114: opened from a list, the tapped row's identity stands in
           until the record loads (same avatar the view renders, so nothing jumps). -->
      <AppAvatar v-else-if="!hasContent && preview" v-bind="preview.avatar" :size="48" />
      <div v-else class="view-item__tile" aria-hidden="true">
        <AppIcon v-if="tileIcon" :name="tileIcon" class="view-item__tile-icon" />
      </div>
      <div class="view-item__record-text">
        <AppBreadcrumbs v-if="parentCrumb" class="view-item__eyebrow" :items="[parentCrumb]" />
        <div class="view-item__record-title-row">
          <h1 v-if="hasContent" ref="recordTitleEl" class="view-item__record-title">{{ recordTitle }}</h1>
          <h1 v-else-if="preview" ref="recordTitleEl" class="view-item__record-title">{{ preview.title }}</h1>
          <span v-else class="view-item__record-title-skeleton" aria-hidden="true" />
          <slot v-if="hasContent" name="title-extra" />
        </div>
        <!-- NEO-57's quiet identity line under the name ("F · 47 y", "Dentist · Clinic"). -->
        <div v-if="hasContent && $slots['record-details']" class="view-item__record-details">
          <IdentityDetailsWrapScope><slot name="record-details" /></IdentityDetailsWrapScope>
        </div>
        <!-- NEO-152: while loading, the identity line and the actions keep
             their place as skeletons, so the header doesn't grow when they arrive. -->
        <div v-else-if="!hasContent && detailsSkeleton" class="view-item__record-details view-item__record-details--skeleton" aria-hidden="true">
          <span class="view-item__skeleton-bar" data-testid="record-details-skeleton" />
        </div>
      </div>
      <div v-if="hasContent && $slots['header-actions']" ref="headerActionsEl" class="view-item__header-actions">
        <slot name="header-actions" />
      </div>
      <div v-else-if="!hasContent && actionSkeletons > 0" class="view-item__header-actions view-item__header-actions--skeleton" aria-hidden="true" data-testid="record-actions-skeleton">
        <span v-for="n in actionSkeletons" :key="n" class="view-item__action-skeleton" />
      </div>
    </header>
    <!-- NEO-55 row for views without a record header (and for not-found /
         load error): the back arrow is AppLayout's ("← <Module>" in the
         page header, the card's first line); this row keeps only the view's
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
    <div v-else-if="hasContent" class="view-item__card" :class="{ 'view-item__card--with-aside': showAside }">
      <div class="view-item__main">
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
      <!-- NEO-153: optional side panel next to the tabs, from 1280px; below
           that it is not mounted at all (so it fetches nothing there) and its
           content stays reachable through the tabs. -->
      <aside v-if="showAside" class="view-item__aside">
        <slot name="aside" />
      </aside>
    </div>
    <div v-else-if="!loading && loadError" class="view-item__state-wrap">
      <AppStateView :title="loadErrorTitle" :subtitle="loadErrorSubtitle">
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
    <AppRecordSkeleton v-else-if="showRecordHeader" />
    <div v-else class="view-item__loading">
      <AppLoadingState />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useSlots, watchEffect } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { useRoute, type RouteLocationRaw } from "vue-router";
import { AppStateView, useErrorText } from "@ui";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import AppAvatar from "./AppAvatar.vue";
import { recordPreviewFor } from "../composables/useRecordPreview";
import { useDetailAsideShown } from "../composables/useDetailAside";
import AppLoadingState from "./AppLoadingState.vue";
import AppRecordSkeleton from "./AppRecordSkeleton.vue";
import AppBreadcrumbs from "./AppBreadcrumbs.vue";
import RecordToolbar from "./RecordToolbar.vue";
import { useRecordHeaderCollapse } from "../composables/useRecordHeaderCollapse";
import { IdentityDetailsWrapScope } from "./identityDetailsWrap";
import { useFitTitle } from "../composables/useFitTitle";
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
   * The error behind `loadError` (NEO-81). When given, the error state says
   * what actually happened — offline vs. a problem on our side (with a short
   * support reference) vs. no access — instead of always "Network problem".
   */
  loadErrorCause?: unknown;
  /**
   * The record's display name (NEO-56). When set, the header becomes the
   * record header — module tile, parent eyebrow link, this name as the h1 —
   * instead of the back-arrow row. Pass it even while loading (empty is
   * fine): the header then holds a placeholder so nothing jumps.
   */
  recordTitle?: string;
  /** Tile icon override — e.g. the org-type icon for an HCO (NEO-18). Defaults to the module icon. */
  recordIcon?: AppIconName;
  /** How many header actions the loaded record shows — the loading header keeps that many placeholders (NEO-152). 0 = none. */
  actionSkeletons?: number;
  /** Whether the loaded record has an identity line (#record-details) — the loading header keeps its place (NEO-152). */
  detailsSkeleton?: boolean;
}>(), { title: "", loadError: false, loadErrorCause: undefined, recordTitle: undefined, recordIcon: undefined, actionSkeletons: 3, detailsSkeleton: true });

const describeError = useErrorText();
const loadErrorText = computed(() => (props.loadErrorCause == null ? null : describeError(props.loadErrorCause)));
const loadErrorTitle = computed(() => loadErrorText.value?.title ?? t("app.errorState.title"));
const loadErrorSubtitle = computed(() =>
  loadErrorText.value
    ? [loadErrorText.value.body, loadErrorText.value.reference].filter(Boolean).join(" ")
    : t("app.errorState.subtitle"),
);

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

// NEO-114: the identity of the list row this record was opened from, shown
// in the header while the record itself is still loading.
const route = useRoute();
const preview = computed(() =>
  props.loading && !props.hasContent ? recordPreviewFor(route?.name, Object.values(route?.params ?? {})[0]) : null,
);

const showRecordHeader = computed(
  () => !!parentCrumb.value && props.recordTitle !== undefined && (props.hasContent || props.loading),
);

// While the record header is shown it replaces AppLayout's desktop
// "← <Module>" page-header row (NEO-55) — the eyebrow link is the way back.
const slots = useSlots();
const isWide = useDetailAsideShown();
const showAside = computed(() => !!slots.aside && isWide.value);

// NEO-158: the name on one line, the identity line under it wrapping between
// its parts ("Pulmonologist ·" / "Klinika Testowa") rather than mid-name.
const recordHeaderEl = ref<HTMLElement | null>(null);
const recordTitleEl = ref<HTMLElement | null>(null);
const headerActionsEl = ref<HTMLElement | null>(null);
useFitTitle(recordTitleEl, computed(() => props.recordTitle ?? preview.value?.title));

const isPhone = useMediaQuery("(max-width: 767.98px)");
const phoneToolbar = computed(() => isPhone.value && showRecordHeader.value);
// The header collapses only once the record is there (not over a skeleton).
const collapsing = computed(() => phoneToolbar.value && props.hasContent);
const viewEl = ref<HTMLElement | null>(null);
const collapseSentinel = ref<HTMLElement | null>(null);
useRecordHeaderCollapse({ root: viewEl, sentinel: collapseSentinel, header: recordHeaderEl, title: recordTitleEl, enabled: collapsing });

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

/* NEO-152: the record's actions read like the list toolbar above it — the
   same 56 px buttons 8 px apart with 22 px glyphs, the last one on the same
   right edge. */
.view-item__record-header > .view-item__header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  /* Centred on the name, not on the whole text block: the eyebrow (16 px)
     + 4 px gap + half the 32 px name row = 36 px, minus half a 56 px button. */
  align-self: flex-start;
  margin-top: 8px;
}
.view-item__action-skeleton {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.view-item__action-skeleton::before {
  content: "";
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.view-item__record-details--skeleton {
  display: flex;
  align-items: center;
  height: 1.3125rem;
}
.view-item__skeleton-bar {
  display: block;
  width: 160px;
  max-width: 60%;
  height: 0.75rem;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
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
  gap: var(--space-2, 8px) var(--space-3, 12px);
  min-height: 2rem;
  min-width: 0;
}
/* A badge next to the name ("Invited") keeps its size; the name gives way. */
.view-item__record-title-row > :not(.view-item__record-title) {
  flex-shrink: 0;
}

/* NEO-158: one line, always. useFitTitle shrinks a long name to fit (down to
   18 px); only past that does it end in "…". */
.view-item__record-title {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.2;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-item__record-details {
  font-size: 0.875rem;
  min-width: 0;
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
  .view-item__record-title-skeleton,
  .view-item__skeleton-bar,
  .view-item__action-skeleton::before {
    animation: view-item-pulse 1.4s ease-in-out infinite;
  }
  @keyframes view-item-pulse {
    50% { opacity: 0.45; }
  }
}

/* Phone (NEO-152): the same header as on desktop — tile, then the "MODULE ›"
   link over the name over the identity line — so a record looks the same
   everywhere and the avatar lands in the same place when it flies in from
   the list. The link is the way back (AppLayout drops its "← Module" row on
   phones too). Only the actions move: three 56 px buttons beside the name
   would squeeze it, so they wrap onto their own row under the header. */
@media (max-width: 767.98px) {
  /* NEO-158: sized from 0, not from its one-line name — otherwise a long name
     makes the text block wrap under the avatar instead of shrinking beside it. */
  .view-item__record-header > .view-item__record-text {
    flex-basis: 0;
  }
  .view-item__record-header {
    flex-wrap: wrap;
    column-gap: var(--space-3, 12px);
    row-gap: var(--space-3, 12px);
    min-height: 0;
    margin-bottom: var(--space-4, 16px);
  }
  /* 48 px buttons on their own row, on the right like the phone list's
     toolbar: the last button ends on the card's content edge. */
  .view-item__record-header > .view-item__header-actions {
    order: 3;
    flex: 1 0 100%;
    justify-content: flex-end;
    align-self: auto;
    margin: 0;
  }
  .view-item__header-actions :deep(.v-btn--icon.v-btn--size-large),
  .view-item__action-skeleton {
    width: 48px;
    height: 48px;
  }
  /* A 44 px tall touch target around the small link, without growing the line. */
  .view-item__record-header .view-item__eyebrow {
    padding-block: 12px;
    margin-block: -12px;
  }
  .view-item__tile {
    width: 40px;
    height: 40px;
    border-radius: 10px;
  }
  .view-item__tile-icon {
    width: 22px;
    height: 22px;
  }
  /* NEO-115 step 3: the record name is this page's heading — same 24 px bold
     as a main page title; "← Module" above it is a small grey link. */
  .view-item__record-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 32px;
  }
  /* The name row is 32 px tall while loading too (skeleton) — the header must
     not jump when the record arrives (e2e breadcrumbs "nothing jumps"). */
  .view-item__record-header .view-item__record-title-row {
    min-height: 32px;
    align-items: center;
  }
}

/* NEO-181, phones: the toolbar above the header has the way back (‹ MODULE)
   and the actions, so the header drops its eyebrow link and its icon row.
   The row stays in the DOM, out of sight: the toolbar mirrors those buttons
   and clicks them (hidden elements still run their handlers). */
.view-item__collapse-sentinel {
  display: block;
  height: 0;
}
.view-item--toolbar .view-item__record-header .view-item__eyebrow {
  display: none;
}
.view-item--toolbar .view-item__record-header > .view-item__header-actions {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
.view-item--toolbar .view-item__record-header {
  flex-wrap: nowrap;
  padding-top: var(--space-2, 8px);
}

/* The collapse: the header scrolls up natively and pins with its last 48 px
   on the toolbar row (sticky, negative top); transparent, over the toolbar's
   background and under its buttons. The avatar and the name travel there by
   scroll-driven keyframes — the numbers come from useRecordHeaderCollapse. */
.view-item--collapsing {
  /* NEO-183: room for a short record to scroll its header into the toolbar. */
  padding-bottom: var(--rh-room, 0px);
}
.view-item--collapsing .view-item__record-header {
  position: sticky;
  top: calc(var(--v-layout-top, 56px) + 48px - var(--rh-R, 0px));
  z-index: 5;
  pointer-events: none;
}
.view-item--collapsing .view-item__record-header > :deep(:first-child),
.view-item--collapsing .view-item__record-title {
  transform-origin: 0 0;
  will-change: transform;
}
@keyframes view-item-dock-avatar {
  to {
    transform: translate(var(--rh-av-dx, 0px), var(--rh-av-dy, 0px)) scale(var(--rh-av-s, 1));
  }
}
@keyframes view-item-dock-title {
  from {
    max-width: var(--rh-nm-w0, 100%);
  }
  to {
    transform: translate(var(--rh-nm-dx, 0px), var(--rh-nm-dy, 0px)) scale(var(--rh-nm-s, 1));
    max-width: var(--rh-nm-w1, 100%);
  }
}
@keyframes view-item-dock-fade {
  to {
    opacity: 0;
    visibility: hidden;
  }
}
@supports (animation-timeline: scroll()) {
  /* Linear on purpose: each pixel of scroll moves everything by one step,
     so the motion stays glued to the finger in both directions. */
  .view-item--collapsing .view-item__record-header > :deep(:first-child) {
    animation: view-item-dock-avatar linear both;
    animation-timeline: scroll(root block);
    animation-range: var(--rh-start, 0px) calc(var(--rh-start, 0px) + var(--rh-R, 1px));
  }
  .view-item--collapsing .view-item__record-title {
    animation: view-item-dock-title linear both;
    animation-timeline: scroll(root block);
    animation-range: var(--rh-start, 0px) calc(var(--rh-start, 0px) + var(--rh-R, 1px));
  }
  .view-item--collapsing .view-item__record-details,
  .view-item--collapsing .view-item__record-title-row > :deep(:not(h1)) {
    animation: view-item-dock-fade linear both;
    animation-timeline: scroll(root block);
    animation-range: var(--rh-start, 0px) calc(var(--rh-start, 0px) + var(--rh-fade, 24px));
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

.view-item__main {
  min-width: 0;
}

/* NEO-153: 720px content column (DetailViewTabs caps itself there) + a 320px
   side panel that stays in view while the column scrolls. CORE-96: on a wide
   screen the spare width goes between them, so the panel ends on the right
   content edge, under the header actions. */
.view-item__card--with-aside {
  display: grid;
  grid-template-columns: minmax(0, 720px) 320px;
  justify-content: space-between;
  gap: var(--space-8, 32px);
  align-items: start;
}

.view-item__aside {
  position: sticky;
  top: var(--space-4, 16px);
  /* A tall panel scrolls inside itself instead of hanging below the fold. */
  max-height: calc(100dvh - var(--space-8, 32px));
  overflow-y: auto;
  scrollbar-width: thin;
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
  /* minmax(0, …): a long unbreakable value (an e-mail) must wrap, never widen
     the page — on a phone that zooms the whole screen out (NEO-158). */
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
}
/* NEO-158: on the smallest phones (SE, 320–360 px) a 140 px label column
   leaves the value ~100 px — a clinic name took six lines. The label goes
   above its value instead. */
@media (max-width: 374.98px) {
  .view-item__card :deep(.view-item__row) {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    margin-bottom: var(--space-2, 8px);
  }
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
  min-width: 0;
  overflow-wrap: anywhere;
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
  width: 22px;
  height: 22px;
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

/* NEO-114: the header's name + avatar can already be on screen (from the
   list row) when the record arrives; its identity line and actions then
   fade in instead of popping in. */
.view-item__record-details,
.view-item__record-header > .view-item__header-actions,
.view-item > :not(.view-item__record-header, .view-item__header-row, .view-item__collapse-sentinel, .record-toolbar, .record-toolbar-bg) {
  animation: view-item-fade-in 220ms cubic-bezier(0, 0, 0.2, 1) both;
}
@keyframes view-item-fade-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .view-item__record-details,
  .view-item__record-header > .view-item__header-actions,
  .view-item > :not(.view-item__record-header, .view-item__header-row, .view-item__collapse-sentinel, .record-toolbar, .record-toolbar-bg) {
    animation: none;
  }
}
</style>
