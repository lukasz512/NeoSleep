/**
 * Shared filter state per view: load from localStorage (per rep), persist on change, clear, active count.
 * Use with RepFilterBar for consistent filter UI. Filter definitions are the single source of truth for keys and defaults.
 */
import { type ViewFilters } from "../utils/rep-settings";
/** Single filter definition: key, label i18n key, type, optional options for select, default value. */
export interface RepFilterDefinition {
    key: string;
    labelKey: string;
    type: "select" | "text";
    /** For type 'select': { title, value, chipClass? }[]. Use empty string for "All" / no filter. chipClass for colored labels in dropdown. */
    options?: {
        title: string;
        value: string;
        chipClass?: string;
    }[];
    default?: string;
    /** For type 'select': allow multiple values. Default true. */
    multiple?: boolean;
}
export declare function useRepFilters(viewId: string, definitions: RepFilterDefinition[]): {
    filterState: import("vue").Ref<ViewFilters, ViewFilters>;
    activeFilterCount: import("vue").ComputedRef<number>;
    hasActiveFilters: import("vue").ComputedRef<boolean>;
    clearFilters: () => void;
};
