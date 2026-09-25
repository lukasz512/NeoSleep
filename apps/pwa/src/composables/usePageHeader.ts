import { computed, inject, provide, ref, type InjectionKey, type Ref } from "vue";

/**
 * The desktop page header (NEO-55): AppLayout renders one row at the top of
 * the content card — [back arrow] + module icon + title — plus an empty slot
 * on its right, which the current view fills via <Teleport> with its own
 * controls (a list's search/filter toolbar, a detail view's actions), so
 * title and controls share one row instead of stacking.
 *
 * Only on desktop: on mobile the title and back arrow live in the app bar and
 * views keep their controls inline, so the teleport is disabled there.
 */
export const PAGE_HEADER_ACTIONS_ID = "layout-page-actions";

const PAGE_HEADER_ACTIVE: InjectionKey<Ref<boolean>> = Symbol("pageHeaderActive");

/** AppLayout: whether the desktop page-header slot is currently shown. */
export function providePageHeader(active: Ref<boolean>): void {
  provide(PAGE_HEADER_ACTIVE, active);
}

/**
 * A component that claims the page header for its own subtree only calls
 * this after reading its own state — nested lists/panels further down (e.g.
 * OrganizationPractitionersPanel inside a detail view) must stay inline.
 */
export function releasePageHeaderForDescendants(): void {
  provide(PAGE_HEADER_ACTIVE, ref(false));
}

const RECORD_HEADER_CLAIM: InjectionKey<Ref<boolean>> = Symbol("recordHeaderClaim");

/**
 * AppLayout: true while a detail view shows its own record header (NEO-56,
 * ItemDetailLayout) — that header's tile + "MODULE ›" eyebrow + name replaces
 * the desktop "← <Module>" page-header row, so AppLayout hides the row.
 */
export function provideRecordHeaderClaim(): Ref<boolean> {
  const claim = ref(false);
  provide(RECORD_HEADER_CLAIM, claim);
  return claim;
}

/** ItemDetailLayout: set to true while its record header is shown. A no-op ref outside AppLayout (tests). */
export function useRecordHeaderClaim(): Ref<boolean> {
  return inject(RECORD_HEADER_CLAIM, ref(false));
}

/** Props for a <Teleport> into the page header; disabled outside AppLayout (tests) and on mobile. */
export function usePageHeaderTeleport() {
  const active = inject(PAGE_HEADER_ACTIVE, ref(false));
  return {
    to: `#${PAGE_HEADER_ACTIONS_ID}`,
    disabled: computed(() => !active.value),
  };
}
