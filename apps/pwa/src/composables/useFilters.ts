/**
 * Shared filter state per view, remembered per user on this device (CORE-45, @neo/prefs).
 * Use with AppFilterBar for consistent filter UI. Filter definitions are the single source of truth for keys and defaults.
 */

import { computed } from "vue";
import { usePersistedState } from "@prefs";
import type { ViewFilters } from "../utils/user-settings";

/** Single filter definition: key, label i18n key, type, optional options for select, default value. */
export interface FilterDefinition {
  key: string;
  labelKey: string;
  type: "select" | "text";
  /** For type 'select': { title, value, chipClass? }[]. Use empty string for "All" / no filter. chipClass for colored labels in dropdown. */
  options?: { title: string; value: string; chipClass?: string }[];
  default?: string;
  /** For type 'select': allow multiple values. Default true. */
  multiple?: boolean;
}

function toArray(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v.filter((s) => String(s).trim() !== "").map(String) : String(v).trim() ? [String(v).trim()] : [];
}

const isMulti = (d: FilterDefinition) => d.type === "select" && d.multiple !== false;

/**
 * Returns reactive filter state for a view, saved for the signed-in user on this device.
 * - filterState: reactive record key -> value; mutate to change, or replace on clear.
 * - activeFilterCount / hasActiveFilters: for the filter button's badge.
 * - clearFilters(): sets all keys to their default (or '').
 * A saved value that is no longer one of a filter's options (e.g. a deleted territory) is dropped
 * on load, so the list never comes up empty for a reason the user can't see. Options that
 * aren't known yet (empty list, or only "All" while lookups load) are left alone.
 */
export function useFilters(viewId: string, definitions: FilterDefinition[]) {
  const defaults: ViewFilters = {};
  for (const d of definitions) defaults[d.key] = isMulti(d) ? [] : (d.default ?? "");

  const filterState = usePersistedState<ViewFilters>(`view:${viewId}:filters`, defaults, {
    // Before multi-select, values were single strings.
    normalize: (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
      const out: Record<string, unknown> = { ...raw };
      for (const d of definitions) if (isMulti(d) && d.key in out) out[d.key] = toArray(out[d.key]);
      return out;
    },
    validate: (state) => {
      const out: ViewFilters = { ...state };
      for (const d of definitions) {
        // "All" (value "") is always there; lookup-driven options (specialty, region…) arrive
        // later from the API, so with nothing but "All" the real options aren't known yet.
        const known = new Set((d.options ?? []).map((o) => o.value).filter((v) => v !== ""));
        if (!known.size) continue;
        const v = out[d.key];
        if (Array.isArray(v)) out[d.key] = v.filter((s) => known.has(s));
        else if (v && !known.has(v)) out[d.key] = d.default ?? "";
      }
      return out;
    },
  });

  const activeFilterCount = computed(() => {
    let n = 0;
    for (const d of definitions) {
      const v = filterState.value[d.key];
      if (isMulti(d)) n += toArray(v).length;
      else if (typeof v === "string" && v.trim() !== "") n++;
    }
    return n;
  });

  const hasActiveFilters = computed(() => activeFilterCount.value > 0);

  function clearFilters() {
    filterState.value = { ...defaults, ...Object.fromEntries(definitions.filter(isMulti).map((d) => [d.key, []])) };
  }

  return {
    filterState,
    activeFilterCount,
    hasActiveFilters,
    clearFilters,
  };
}
