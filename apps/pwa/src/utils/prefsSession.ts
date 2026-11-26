/**
 * PWA-specific pieces of the per-user preferences (CORE-45, @neo/prefs):
 * moving the old device-wide filters into the signed-in user's slots, and the
 * user's own language. Wired to the auth session in composables/usePrefsSession.ts.
 */
import { browserStorage, prefsKey, readPref, writePref, type PrefsIdentity } from "@prefs";
import { takeLegacyFilters } from "./user-settings";

export type AppLocale = "en" | "pl" | "mx";
const LOCALES: readonly string[] = ["en", "pl", "mx"];
const LOCALE_SLOT = "locale";

/**
 * The old `app-settings.filters` were shared by every account on the device. The first
 * person to sign in after the update keeps them (it was most likely theirs); they are then
 * removed, so nobody after them inherits someone else's filters.
 */
export function migrateLegacyFilters(id: PrefsIdentity): void {
  const legacy = takeLegacyFilters();
  if (!legacy) return;
  const storage = browserStorage();
  for (const [viewId, filters] of Object.entries(legacy)) {
    const key = prefsKey(id, `view:${viewId}:filters`);
    if (readPref(storage, key) === undefined) writePref(storage, key, filters);
  }
}

export function readUserLocale(id: PrefsIdentity): AppLocale | null {
  const v = readPref(browserStorage(), prefsKey(id, LOCALE_SLOT));
  return typeof v === "string" && LOCALES.includes(v) ? (v as AppLocale) : null;
}

export function saveUserLocale(id: PrefsIdentity, locale: AppLocale): void {
  writePref(browserStorage(), prefsKey(id, LOCALE_SLOT), locale);
}
