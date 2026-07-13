import { describe, it, expect, beforeEach, vi } from "vitest";
import { getUserSettings, setUserSettings } from "./user-settings";
import { APP_STORAGE_KEYS } from "../constants";

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

describe("user-settings", () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === "undefined") {
      vi.stubGlobal("localStorage", mockLocalStorage);
    }
    for (const k of Object.keys(storage)) delete storage[k];
  });

  it("getUserSettings returns defaults when storage is empty", () => {
    const s = getUserSettings();
    expect(s.theme).toBe("light");
    expect(s.locale).toBe("en");
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.filters).toEqual({});
  });

  it("setUserSettings persists and getUserSettings returns saved values", () => {
    setUserSettings({ theme: "dark", locale: "pl" });
    const s = getUserSettings();
    expect(s.theme).toBe("dark");
    expect(s.locale).toBe("pl");
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
    expect(s.theme).toBe("light");
    expect(s.locale).toBe("en");
    if (typeof globalThis.localStorage !== "undefined") {
      const raw = globalThis.localStorage.getItem(APP_STORAGE_KEYS.settings);
      expect(raw).toBeNull();
    }
  });
});
