/**
 * Unified app settings (per user / instance) in localStorage.
 * Single key (`app-settings`) so we can later sync to backend.
 */

import { useLocalStorage } from "@vueuse/core";
import { APP_STORAGE_KEYS } from "../constants";

export interface HcpFilters {
  specialty?: string;
  institution?: string;
  region?: string;
}

/** Per-view filter state: key -> value. Single select: string. Multi-select: string[]. Persisted per viewId in localStorage. */
export type ViewFilters = Record<string, string | string[]>;

export interface AppSettings {
  // Theme lives in the shared theme store (packages/stores/theme.ts) — its
  // own localStorage key, not here. Do not re-add it here.
  locale?: "en" | "pl" | "mx";
  sidebarCollapsed?: boolean;
  /** Keyed by view id (e.g. 'leads', 'hcp'). Each value is a record of filter key -> value. */
  filters?: Record<string, ViewFilters>;
}

// No default for `locale` here: this module's useLocalStorage() singleton persists
// its defaults to localStorage as soon as it's created, which — depending on module
// import order — can happen before plugins/i18n.ts's resolveInitialLocale() runs its
// browser-language detection. A hardcoded default here would race that detection and
// silently pin every first-time visitor to "en" regardless of their browser locale.
const DEFAULTS: AppSettings = {
  sidebarCollapsed: false,
  filters: {},
};

const _store = useLocalStorage<AppSettings>(APP_STORAGE_KEYS.settings, { ...DEFAULTS }, {
  mergeDefaults: true,
  // Reading settings (getUserSettings) must not have the side effect of
  // writing defaults to storage — only setUserSettings should ever persist.
  writeDefaults: false,
});

/**
 * Returns current app settings. Uses defaults when storage is empty.
 */
export function getUserSettings(): AppSettings {
  return { ..._store.value };
}

/**
 * Updates app settings (shallow merge at top level; filters[viewId] is merged).
 * Persists to localStorage automatically via useLocalStorage.
 */
export function setUserSettings(partial: Partial<AppSettings>): void {
  const current = _store.value;
  const next: AppSettings = { ...current, ...partial };
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
