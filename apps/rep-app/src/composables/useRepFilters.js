/**
 * Shared filter state per view: load from localStorage (per rep), persist on change, clear, active count.
 * Use with RepFilterBar for consistent filter UI. Filter definitions are the single source of truth for keys and defaults.
 */
import { ref, computed, watch } from "vue";
import { getRepSettings, setRepSettings } from "../utils/rep-settings";
/**
 * Returns reactive filter state for a view, persisted in localStorage under rep settings (filters[viewId]).
 * - filterState: reactive record key -> value; mutate to change, or replace on clear.
 * - activeFilterCount: number of filters with non-empty value.
 * - hasActiveFilters: true when activeFilterCount > 0.
 * - clearFilters(): sets all keys to their default (or '').
 * State is saved automatically when filterState changes.
 */
function toArray(v) {
    if (v === undefined || v === null)
        return [];
    return Array.isArray(v) ? v.filter((s) => String(s).trim() !== "") : String(v).trim() ? [String(v).trim()] : [];
}
export function useRepFilters(viewId, definitions) {
    const defaults = {};
    for (const d of definitions) {
        const multi = d.type === "select" && (d.multiple !== false);
        defaults[d.key] = multi ? [] : (d.default ?? "");
    }
    const saved = getRepSettings().filters?.[viewId];
    const initial = { ...defaults };
    if (saved && typeof saved === "object") {
        for (const d of definitions) {
            if (d.key in saved) {
                const multi = d.type === "select" && (d.multiple !== false);
                const raw = saved[d.key];
                if (multi) {
                    initial[d.key] = toArray(raw);
                }
                else if (typeof raw === "string") {
                    initial[d.key] = raw;
                }
            }
        }
    }
    const filterState = ref(initial);
    const activeFilterCount = computed(() => {
        let n = 0;
        for (const d of definitions) {
            const v = filterState.value[d.key];
            const multi = d.type === "select" && (d.multiple !== false);
            if (multi) {
                n += toArray(v).length;
            }
            else if (typeof v === "string" && v.trim() !== "") {
                n++;
            }
        }
        return n;
    });
    const hasActiveFilters = computed(() => activeFilterCount.value > 0);
    function clearFilters() {
        const next = {};
        for (const d of definitions) {
            const multi = d.type === "select" && (d.multiple !== false);
            next[d.key] = multi ? [] : (d.default ?? "");
        }
        filterState.value = next;
    }
    watch(filterState, () => {
        setRepSettings({ filters: { [viewId]: { ...filterState.value } } });
    }, { deep: true });
    return {
        filterState,
        activeFilterCount,
        hasActiveFilters,
        clearFilters,
    };
}
