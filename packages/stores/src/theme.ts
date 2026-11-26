import { defineStore } from "pinia";
import { ref, computed, watch, nextTick } from "vue";

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";

const STORAGE_KEY = "neosleep-theme";

function readStoredPreference(): ThemePreference | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // benign: localStorage unavailable (SSR, privacy mode) — fall through to the default.
  }
  return null;
}

function writeStoredPreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // benign: storage unavailable — the preference just won't persist across reloads.
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
 *   2. OS system preference (prefers-color-scheme), tracked live — this is
 *      "Auto", the default for anyone who never picked (NEO-102)
 *   3. Tenant's configured default (app_config.color_scheme, fed in via
 *      setTenantDefault() once the config store has loaded) — only when the
 *      browser can't report a system preference
 *   4. "light" — final fallback when nothing else can be determined
 *
 * "system" is itself a valid stored preference and behaves exactly like no
 * stored preference: follow the OS, continuously.
 */
export const useThemeStore = defineStore("theme", () => {
  const explicitPreference = ref<ThemePreference | null>(readStoredPreference());
  const tenantDefault = ref<ThemeMode | null>(null);
  const systemPrefersDark = ref<boolean | null>(getSystemPrefersDark());

  let mediaQuery: MediaQueryList | null = null;

  const preference = computed<ThemePreference>(() => explicitPreference.value ?? "system");

  /** What preference + OS + tenant default resolve to, right now. */
  const resolvedMode = computed<ThemeMode>(() => {
    if (explicitPreference.value === "light" || explicitPreference.value === "dark") {
      return explicitPreference.value;
    }
    if (systemPrefersDark.value !== null) return systemPrefersDark.value ? "dark" : "light";
    if (tenantDefault.value) return tenantDefault.value;
    return "light";
  });

  /**
   * The mode actually painted. It trails resolvedMode only while a theme view
   * transition starts: it flips inside the transition's update callback, so
   * every consumer (data-theme, Vuetify, components) changes between the
   * "old" and the "new" snapshot — never before the old one is taken. That
   * half-switched old frame was the jump (CORE-163).
   */
  const appliedMode = ref<ThemeMode>(resolvedMode.value);
  const mode = computed<ThemeMode>(() => appliedMode.value);

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

  /** 2-way toggle for UIs that only expose light/dark. */
  function toggleMode(): void {
    setPreference(resolvedMode.value === "dark" ? "light" : "dark");
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
  // wiring required. App-specific side effects (favicon, Vuetify) watch
  // `mode`, which flips inside the same transition callback.
  const hasDocument = typeof document !== "undefined";
  let isFirstApply = true;
  let transitionToken = 0;

  function apply(m: ThemeMode): void {
    appliedMode.value = m;
    if (hasDocument) document.documentElement.setAttribute("data-theme", m);
  }

  watch(resolvedMode, (m) => {
    // Plain switch for the initial pre-mount application (nothing to fade
    // from yet), without View Transitions support (packages/brand/
    // transitions.css covers that with a CSS color transition) and under
    // prefers-reduced-motion.
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isFirstApply || !hasDocument || reducedMotion || typeof document.startViewTransition !== "function") {
      isFirstApply = false;
      apply(m);
      return;
    }
    // data-theme-transition switches off every named view-transition group
    // (page sheet, calendar, …) for this one transition, so the whole screen
    // — the open account menu on top included — crossfades as one picture
    // instead of named layers being lifted above the menu (CORE-163).
    const root = document.documentElement;
    const token = ++transitionToken;
    root.setAttribute("data-theme-transition", "");
    const transition = document.startViewTransition(async () => {
      apply(m);
      await nextTick(); // let Vue re-render before the "new" snapshot
    });
    void transition.finished.finally(() => {
      if (token === transitionToken) root.removeAttribute("data-theme-transition");
    });
  }, {
    immediate: true,
    flush: "sync", // start at once — no flash, no waiting on the next tick
  });

  // Auto follows the OS live: when the device goes dark, so does the app.
  startSystemListener();

  return {
    mode, preference,
    setPreference, cyclePreference, toggleMode,
    setTenantDefault, startSystemListener,
  };
});
