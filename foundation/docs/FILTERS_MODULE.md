# Filters module (shared)

One shared filter system for list views (Leads, Contacts/HCP, and future views). Filters are defined in one place, persisted per rep in localStorage, and rendered by a single component with a clear button and an active-count badge.

**Leads:** Filtering is **server-side**. The view sends filter values (and search) as query params to `GET /api/leads`; the BFF applies them in the DB and returns only the matching page. See DATA_AND_API.md (Leads API). **HCP (and HCO):** Currently use client-side data (mock or future API); when HCP gets a BFF endpoint, filters should be applied server-side the same way.

## Where filters are defined (single source of truth)

**Filter definitions** live in each view that uses filters. They are the source of truth for:

- **Keys** (e.g. `status`, `region`, `specialty`) – used in state, API params, and localStorage.
- **Labels** – i18n keys for the form labels.
- **Type** – `select` (dropdown) or `text` (search-like).
- **Options** – for `select`, an array of `{ title, value }` (can be computed from API or static).
- **Default** – value when the filter is "empty" (e.g. `[]` for multi-select, `""` for single). **Multiple** – for `select`, `multiple: true` (default) allows selecting multiple values; state is `string[]`.

Example (Leads):

```ts
const leadFilterDefsForComposable: RepFilterDefinition[] = [
  { key: "status", labelKey: "rep.leads.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "rep.leads.filters.region", type: "select", default: "" },
];
```

Definitions with **options** (for the UI) are built in the view (e.g. from i18n or API) and passed to `RepFilterBar`; the composable only needs keys and defaults for state and persistence.

## Composable: `useRepFilters(viewId, definitions)`

**File:** `apps/rep-app/src/composables/useRepFilters.ts`

- **viewId** – e.g. `"leads"` or `"hcp"`. Used as the key under `rep-settings.filters[viewId]` in localStorage.
- **definitions** – array of `RepFilterDefinition` (at least `key` and `default`).

Returns:

- **filterState** – `Ref<Record<string, string | string[]>>`. Single select: string. Multi-select: string[]. The view binds this to the API (e.g. query params) and to `RepFilterBar`.
- **activeFilterCount** – `ComputedRef<number>`. Total number of selected values across all filters (for the badge).
- **hasActiveFilters** – `ComputedRef<boolean>`.
- **clearFilters()** – sets every key to its `default`; state is persisted automatically.

**Persistence:** When `filterState` changes (any key), the composable calls `setRepSettings({ filters: { [viewId]: filterState.value } })`. Settings are stored under one localStorage key (see `rep-settings.ts`), so filters are per rep / per device. Later you can sync this to the backend.

## Component: `RepFilterBar`

**File:** `apps/rep-app/src/components/RepFilterBar.vue`

- **modelValue** – current filter state (same object as `filterState` from the composable).
- **definitions** – full definitions including `options` for select fields.
- **titleKey** – i18n key for the menu title (e.g. `rep.leads.filters.title`).
- **clearKey** – i18n key for the “Clear filters” button (e.g. `rep.leads.filters.clear`).
- **activeFilterCount** – number to show in the badge (from the composable).

**Emits:**

- **update:modelValue** – when a filter field changes; parent should update `filterState` and e.g. reload data.
- **clear** – when the user clicks “Clear filters”; parent should call `clearFilters()` and reload.

**UI:** **Clear** icon button (primary color, X icon – same as search clear) is shown to the left of the filter icon when there are **search text or active filters** (`hasActiveFiltersOrSearch`). Clicking it clears both search and filters. Filter icon button (min 44×44 px touch target on mobile) opens the dropdown; when there are active filters, a **badge** shows the count. The dropdown is a card with one control per definition (VSelect or VTextField). **Search input clear**: When the search field has content, an X button appears inside the input (append-inner), styled like the filter clear. **On mobile** (viewport &lt; 768px): the search input clear is hidden; only the toolbar clear button is shown (single clear for both search and filters).

## How to add filters to a new view

1. Define the filter definitions (keys, labelKeys, type, default; options can be computed).
2. Call `useRepFilters(viewId, definitions)` to get `filterState`, `activeFilterCount`, `clearFilters`.
3. Build definitions-with-options for the bar (e.g. from API or i18n).
4. In the template: add `RepFilterBar` with `:model-value="filterState"`, `:definitions="…"`, `:active-filter-count="activeFilterCount"`, `@update:model-value="onFilterStateUpdate"`, `@clear="onFiltersClear"`.
5. In `onFilterStateUpdate`: assign the new state to `filterState` (or let the composable own it and only trigger reload); reset page if needed; reload data (e.g. call BFF with filter params).
6. In `onFiltersClear`: call `clearFilters()`, reset page, reload data.
7. Add i18n keys for the view’s `titleKey` and `clearKey` (e.g. `rep.leads.filters.title`, `rep.leads.filters.clear`).

## No-results placeholder (filtered empty state)

When `total === 0` and the user has active filters or search, `RepEntityList` shows a **no-results placeholder** instead of the table:

- **Icon** – magnifying glass (search / no results metaphor), 72px on mobile, 96px on desktop; primary color, 50% opacity.
- **Title** – e.g. "No results matching your criteria" (i18n: `noResultsForCriteria`).
- **Subtitle** – e.g. "Try changing or clearing filters and search." (i18n: `noResultsForCriteriaSubtitle`).
- **Clear filters** button – outlined, primary; calls `clearFilters()` and reloads.

Tests: `RepEntityList.spec.ts` – no-results placeholder has icon, magnifying glass SVG, aria-hidden.

## Styling and accessibility

- Filter button uses `--rep-btn-min-width` / `--rep-btn-min-height` (44 px on mobile) for touch targets.
- Badge shows only when `activeFilterCount > 0`.
- Clear filters button is outside the card, to the left of the filter icon; primary color; visible only when `activeFilterCount > 0`.
- All copy comes from i18n (titleKey, clearKey, labelKey per field).

## Tests

- **useRepFilters.spec.ts** – initial state from defaults or from localStorage, `activeFilterCount`, `clearFilters`, persistence on change.
- **RepFilterBar.spec.ts** – renders button, shows badge when `activeFilterCount > 0`, emits `clear` when Clear is clicked.
- **rep-settings.spec.ts** – merge of `filters[viewId]` for any viewId (hcp, leads).

## Summary

- **Definitions** = single source of truth (in the view, or a shared config module).
- **useRepFilters** = state, count, clear, and localStorage persistence per viewId.
- **RepFilterBar** = one UI for all views: icon + badge, dropdown with fields and Clear.
- **Saving** = automatic on every change; storage key is the same as rep-app settings (one key per rep); later sync to backend possible.
