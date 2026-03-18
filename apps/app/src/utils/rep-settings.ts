/**
 * Unified rep-app settings (per rep / instance) in localStorage.
 * Single key (`rep-app-settings`) so we can later sync to backend.
 */

import { REP_STORAGE_KEYS } from "../constants";

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

const DEFAULTS: RepAppSettings = {
  theme: "light",
  locale: "en",
  sidebarCollapsed: false,
  filters: {},
};

/**
 * Returns current rep-app settings from localStorage. Uses defaults when storage is empty.
 */
export function getRepSettings(): RepAppSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(REP_STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as RepAppSettings;
    return typeof parsed === "object" && parsed !== null ? { ...DEFAULTS, ...parsed } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Updates rep-app settings (shallow merge at top level; filters.hcp is merged).
 * Persists to localStorage under a single key.
 */
export function setRepSettings(partial: Partial<RepAppSettings>): void {
  if (typeof localStorage === "undefined") return;
  const current = getRepSettings();
  const next: RepAppSettings = {
    ...current,
    ...partial,
  };
  if (partial.filters !== undefined) {
    next.filters = { ...current.filters };
    for (const viewId of Object.keys(partial.filters)) {
      const currentView = current.filters?.[viewId] as ViewFilters | undefined;
      const partialView = partial.filters[viewId] as ViewFilters | undefined;
      if (partialView && typeof partialView === "object") {
        next.filters![viewId] = { ...currentView, ...partialView };
      }
    }
  }
  try {
    localStorage.setItem(REP_STORAGE_KEYS.settings, JSON.stringify(next));
  } catch {
    // ignore
  }
}
