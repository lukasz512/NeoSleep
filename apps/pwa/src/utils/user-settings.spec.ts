import { describe, it, expect, beforeEach, vi } from "vitest";
import { APP_STORAGE_KEYS } from "../constants";
import type { getUserSettings as GetUserSettings, setUserSettings as SetUserSettings } from "./user-settings";

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
};

let getUserSettings: typeof GetUserSettings;
let setUserSettings: typeof SetUserSettings;

describe("user-settings", () => {
  // user-settings.ts holds its state in a module-level useLocalStorage()
  // singleton — a fresh module instance per test (via resetModules + dynamic
  // re-import) is required for real isolation; clearing the mock storage
  // object alone leaves the previous test's in-memory value behind.
  beforeEach(async () => {
    if (typeof globalThis.localStorage === "undefined") {
      vi.stubGlobal("localStorage", mockLocalStorage);
    }
    for (const k of Object.keys(storage)) delete storage[k];
    // jsdom provides a real localStorage (the mock above is a fallback for
    // environments without one) — clear it too, or state leaks between tests.
    globalThis.localStorage?.clear();
    vi.resetModules();
    ({ getUserSettings, setUserSettings } = await import("./user-settings"));
  });

  it("getUserSettings returns defaults when storage is empty", () => {
    const s = getUserSettings();
    // No default locale — resolveInitialLocale() (plugins/i18n.ts) owns first-visit
    // detection from the browser language; a default here would race and override it.
    expect(s.locale).toBeUndefined();
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.filters).toEqual({});
  });

  it("setUserSettings persists and getUserSettings returns saved values", () => {
    setUserSettings({ locale: "pl", sidebarCollapsed: true });
    const s = getUserSettings();
    expect(s.locale).toBe("pl");
    expect(s.sidebarCollapsed).toBe(true);
  });

  it("setUserSettings merges filters per viewId (hcp, leads, etc.)", () => {
    setUserSettings({ filters: { hcp: { specialty: "Sleep medicine" } } });
    let s = getUserSettings();
    expect(s.filters?.hcp?.specialty).toBe("Sleep medicine");

    setUserSettings({ filters: { hcp: { region: "Mazovia" } } });
    s = getUserSettings();
    expect(s.filters?.hcp?.specialty).toBe("Sleep medicine");
    expect(s.filters?.hcp?.region).toBe("Mazovia");

    setUserSettings({ filters: { leads: { status: "qualified", region: "North" } } });
    s = getUserSettings();
    expect(s.filters?.leads?.status).toBe("qualified");
    expect(s.filters?.leads?.region).toBe("North");
  });

  it("getUserSettings with empty storage returns defaults without persisting", () => {
    const s = getUserSettings();
    expect(s.locale).toBeUndefined();
    expect(s.sidebarCollapsed).toBe(false);
    if (typeof globalThis.localStorage !== "undefined") {
      const raw = globalThis.localStorage.getItem(APP_STORAGE_KEYS.settings);
      expect(raw).toBeNull();
    }
  });
});
