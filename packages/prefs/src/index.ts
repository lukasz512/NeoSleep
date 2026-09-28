export {
  PREFS_PREFIX,
  MAX_AGE_MS,
  prefsKey,
  browserStorage,
  readPref,
  writePref,
  removePref,
  pruneExpired,
  sanitize,
  type PrefsIdentity,
  type KeyValueStorage,
} from "./storage";
export {
  usePersistedState,
  setPrefsIdentity,
  getPrefsIdentity,
  WRITE_DEBOUNCE_MS,
  type PersistedStateOptions,
} from "./persisted";
