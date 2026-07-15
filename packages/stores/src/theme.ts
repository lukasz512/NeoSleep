import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";

const STORAGE_KEY = "neosleep-theme";

function readStoredPreference(): ThemePreference | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage unavailable (SSR, privacy mode) — fall through
  }
  return null;
}

function writeStoredPreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // non-fatal — preference just won't persist across reloads
  }
}

function getSystemPrefersDark(): boolean | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Resolves the mode to apply before Vue/Pinia exist yet (pre-mount, to avoid
 * a flash of the wrong theme). Skips the tenant-default tier — app_config
 * hasn't loaded at this point in either app's boot sequence — so this is
 * intentionally a subset of useThemeStore's full resolution, not a duplicate
 * of it: user choice -> system -> light.
 */
export function resolveInitialThemeMode(): ThemeMode {
  const stored = readStoredPreference();
  if (stored === "light" || stored === "dark") return stored;
  const systemDark = getSystemPrefersDark();
  if (systemDark !== null) return systemDark ? "dark" : "light";
  return "light";
}

/**
 * Shared theme store — single source of truth for light/dark mode across
 * apps/web and apps/pwa. No per-app theme logic should exist outside this
 * file; apps only add app-specific *side effects* (favicon swap, Vuetify
 * theme.change()) by watching `mode`.
 *
 * Resolution priority (highest wins):
 *   1. User's explicit choice ("light"/"dark", persisted in localStorage)
 *   2. Tenant's configured default (app_config.color_scheme, fed in via
 *      setTenantDefault() once the config store has loaded)
 *   3. OS system preference (prefers-color-scheme), tracked live
 *   4. "light" — final fallback when nothing else can be determined
 *
 * "system" is itself a valid stored preference: it means step 1 defers
 * continuously to step 3 instead of locking to a fixed value.
 */
export const useThemeStore = defineStore("theme", () => {
  const explicitPreference = ref<ThemePreference | null>(readStoredPreference());
  const tenantDefault = ref<ThemeMode | null>(null);
  const systemPrefersDark = ref<boolean | null>(getSystemPrefersDark());

  let mediaQuery: MediaQueryList | null = null;

  const preference = computed<ThemePreference>(() => explicitPreference.value ?? "system");

  const mode = computed<ThemeMode>(() => {
    if (explicitPreference.value === "light" || explicitPreference.value === "dark") {
      return explicitPreference.value;
    }
    if (explicitPreference.value === "system" && systemPrefersDark.value !== null) {
      return systemPrefersDark.value ? "dark" : "light";
    }
    if (tenantDefault.value) return tenantDefault.value;
    if (systemPrefersDark.value !== null) return systemPrefersDark.value ? "dark" : "light";
    return "light";
  });

  /** Sets an explicit preference. Pass "system" to follow the OS reactively. */
  function setPreference(pref: ThemePreference): void {
    explicitPreference.value = pref;
    writeStoredPreference(pref);
  }

  /** 3-way cycle for UIs that expose a system option (apps/web today). */
  function cyclePreference(): void {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const i = order.indexOf(preference.value);
    setPreference(order[(i + 1) % order.length]!);
  }

  /** 2-way toggle for UIs that only expose light/dark (apps/pwa today). */
  function toggleMode(): void {
    setPreference(mode.value === "dark" ? "light" : "dark");
  }

  /** Feeds the tenant's app_config.color_scheme in once it has loaded. */
  function setTenantDefault(scheme: ThemeMode | null): void {
    tenantDefault.value = scheme;
  }

  /** Starts listening for live OS theme changes. Safe to call once per app. */
  function startSystemListener(): void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function" || mediaQuery) return;
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemPrefersDark.value = mediaQuery.matches;
    mediaQuery.addEventListener("change", (e) => {
      systemPrefersDark.value = e.matches;
    });
  }

  // Universal DOM side effect — every consumer gets this for free, no per-app
  // wiring required. App-specific side effects (favicon, Vuetify) stay local.
  if (typeof document !== "undefined") {
    watch(mode, (m) => document.documentElement.setAttribute("data-theme", m), {
      immediate: true,
      flush: "sync", // apply immediately — no flash, no waiting on the next tick
    });
  }

  return {
    mode, preference,
    setPreference, cyclePreference, toggleMode,
    setTenantDefault, startSystemListener,
  };
});
