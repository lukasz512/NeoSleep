import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type MotionPreference = "full" | "reduced" | "system";

const STORAGE_KEY = "neosleep-motion-preference";

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
}

function getConnection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function getDeviceMemory(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}

function readStoredPreference(): MotionPreference | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "full" || v === "reduced" || v === "system") return v;
  } catch {
    // localStorage unavailable (SSR, privacy mode) — fall through
  }
  return null;
}

function writeStoredPreference(pref: MotionPreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // non-fatal — preference just won't persist across reloads
  }
}

function getSystemReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const SLOW_CONNECTION_TYPES = new Set(["slow-2g", "2g", "3g"]);

function getHeuristicLowPower(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = getConnection();
  if (connection?.saveData === true) return true;
  if (connection?.effectiveType && SLOW_CONNECTION_TYPES.has(connection.effectiveType)) return true;
  const deviceMemory = getDeviceMemory();
  if (typeof deviceMemory === "number" && deviceMemory <= 2) return true;
  if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2) return true;
  return false;
}

/**
 * Shared motion-preference store — single source of truth for whether
 * spring/scale animations (e.g. origin-point dialog transitions) should run
 * at full fidelity, across apps/web and apps/pwa.
 *
 * Resolution priority (highest wins):
 *   1. User's explicit choice ("full"/"reduced", persisted in localStorage)
 *   2. OS system preference (prefers-reduced-motion), tracked live
 *   3. Heuristic device/network signal (connection speed, deviceMemory,
 *      hardwareConcurrency) — re-checked whenever the connection reports a
 *      change
 *
 * "system" is itself a valid stored preference: it means step 1 defers
 * continuously to steps 2/3 instead of locking to a fixed value.
 *
 * No UI exposes setPreference() yet — it exists so a future WCAG toggle can
 * call it without any change to this store.
 */
export const useMotionPreferenceStore = defineStore("motionPreference", () => {
  const explicitPreference = ref<MotionPreference | null>(readStoredPreference());
  const systemReducedMotion = ref(getSystemReducedMotion());
  const heuristicLowPower = ref(getHeuristicLowPower());

  let mediaQuery: MediaQueryList | null = null;
  let connection: NetworkInformationLike | null = null;

  const preference = computed<MotionPreference>(() => explicitPreference.value ?? "system");

  const shouldReduceMotion = computed<boolean>(() => {
    if (explicitPreference.value === "full") return false;
    if (explicitPreference.value === "reduced") return true;
    return systemReducedMotion.value || heuristicLowPower.value;
  });

  /** Sets an explicit preference. Pass "system" to follow OS/heuristics reactively. */
  function setPreference(pref: MotionPreference): void {
    explicitPreference.value = pref;
    writeStoredPreference(pref);
  }

  /** Starts listening for live OS/connection changes. Safe to call once per app. */
  function startListening(): void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (!mediaQuery) {
      mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      systemReducedMotion.value = mediaQuery.matches;
      mediaQuery.addEventListener("change", (e) => {
        systemReducedMotion.value = e.matches;
      });
    }
    const currentConnection = getConnection();
    if (currentConnection && currentConnection !== connection) {
      connection = currentConnection;
      heuristicLowPower.value = getHeuristicLowPower();
      connection.addEventListener?.("change", () => {
        heuristicLowPower.value = getHeuristicLowPower();
      });
    }
  }

  return {
    preference,
    shouldReduceMotion,
    setPreference,
    startListening,
  };
});
