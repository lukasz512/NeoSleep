/**
 * Unified rep-app settings (per rep / instance) in localStorage.
 * Single key (`rep-app-settings`) so we can later sync to backend.
 */

import { useLocalStorage } from "@vueuse/core";
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
  locale?: "en" | "pl" | "mx";
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

const _store = useLocalStorage<RepAppSettings>(REP_STORAGE_KEYS.settings, { ...DEFAULTS }, {
  mergeDefaults: true,
});

/**
 * Returns current rep-app settings. Uses defaults when storage is empty.
 */
export function getRepSettings(): RepAppSettings {
  return { ..._store.value };
}

/**
 * Updates rep-app settings (shallow merge at top level; filters[viewId] is merged).
 * Persists to localStorage automatically via useLocalStorage.
 */
export function setRepSettings(partial: Partial<RepAppSettings>): void {
  const current = _store.value;
  const next: RepAppSettings = { ...current, ...partial };
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
  _store.value = next;
}
