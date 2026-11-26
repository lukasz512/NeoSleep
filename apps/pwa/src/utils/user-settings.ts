/**
 * Device-wide app settings in localStorage (`app-settings`): the last language used on this
 * device (so the login screen speaks it) and the sidebar state. Anything that belongs to a
 * person — list filters, table sort, their language — lives in @neo/prefs, keyed by
 * tenant + user (CORE-45).
 */

import { useLocalStorage } from "@vueuse/core";
import { APP_STORAGE_KEYS } from "../config/storageKeys";

/** Per-view filter state: key -> value. Single select: string. Multi-select: string[]. */
export type ViewFilters = Record<string, string | string[]>;

export interface AppSettings {
  // Theme lives in the shared theme store (packages/stores/theme.ts) — its
  // own localStorage key, not here. Do not re-add it here.
  locale?: "en" | "pl" | "mx";
  sidebarCollapsed?: boolean;
}

/** Before CORE-45 every account on a device shared these; migrated per user by utils/prefsSession.ts. */
interface LegacySettings extends AppSettings {
  filters?: Record<string, ViewFilters>;
  /** Resources videos as small cards or a list (NEO-151) — desktop/tablet only, remembered per device. */
  resourcesLayout?: "cards" | "list";
}

// No default for `locale` here: this module's useLocalStorage() singleton persists
// its defaults to localStorage as soon as it's created, which — depending on module
// import order — can happen before plugins/i18n.ts's resolveInitialLocale() runs its
// browser-language detection. A hardcoded default here would race that detection and
// silently pin every first-time visitor to "en" regardless of their browser locale.
const DEFAULTS: AppSettings = {
  sidebarCollapsed: false,
};

const _store = useLocalStorage<LegacySettings>(APP_STORAGE_KEYS.settings, { ...DEFAULTS }, {
  mergeDefaults: true,
  // Reading settings (getUserSettings) must not have the side effect of
  // writing defaults to storage — only setUserSettings should ever persist.
  writeDefaults: false,
});

/**
 * Returns current app settings. Uses defaults when storage is empty.
 */
export function getUserSettings(): AppSettings {
  const { filters: _legacy, ...settings } = _store.value;
  return settings;
}

/**
 * Updates app settings (shallow merge). Persists to localStorage automatically via useLocalStorage.
 */
export function setUserSettings(partial: Partial<AppSettings>): void {
  _store.value = { ..._store.value, ...partial };
}

/** Removes and returns the pre-CORE-45 shared filters, if any are still stored. */
export function takeLegacyFilters(): Record<string, ViewFilters> | undefined {
  const { filters, ...rest } = _store.value;
  if (filters === undefined) return undefined;
  _store.value = rest;
  return filters && typeof filters === "object" ? filters : undefined;
}
