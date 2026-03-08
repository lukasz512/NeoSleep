/**
 * Unified rep-app settings (per rep / instance) in localStorage.
 * Single key (`rep-app-settings`) so we can later sync to backend.
 */
export interface HcpFilters {
    specialty?: string;
    institution?: string;
    region?: string;
}
/** Per-view filter state: key -> value. Single select: string. Multi-select: string[]. Persisted per viewId in localStorage. */
export type ViewFilters = Record<string, string | string[]>;
export interface RepAppSettings {
    theme?: "light" | "dark";
    locale?: "en" | "pl" | "es";
    sidebarCollapsed?: boolean;
    /** Keyed by view id (e.g. 'leads', 'hcp'). Each value is a record of filter key -> value. */
    filters?: Record<string, ViewFilters>;
}
/**
 * Returns current rep-app settings from localStorage. Uses defaults when storage is empty.
 */
export declare function getRepSettings(): RepAppSettings;
/**
 * Updates rep-app settings (shallow merge at top level; filters.hcp is merged).
 * Persists to localStorage under a single key.
 */
export declare function setRepSettings(partial: Partial<RepAppSettings>): void;
