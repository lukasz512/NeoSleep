import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick } from "vue";
import { useFilters, type FilterDefinition } from "./useFilters";
import { getUserSettings, setUserSettings } from "../utils/user-settings";
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

const defs: FilterDefinition[] = [
  { key: "status", labelKey: "user.leads.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "user.leads.filters.region", type: "select", default: "" },
];

describe("useFilters", () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === "undefined") {
      vi.stubGlobal("localStorage", mockLocalStorage);
    }
    delete storage[APP_STORAGE_KEYS.settings];
  });

  it("returns initial state from defaults when storage is empty", () => {
    const { filterState, activeFilterCount, hasActiveFilters } = useFilters("leads", defs);
    expect(filterState.value).toEqual({ status: [], region: [] });
    expect(activeFilterCount.value).toBe(0);
    expect(hasActiveFilters.value).toBe(false);
  });

  it("returns initial state from saved filters when storage has viewId", () => {
    setUserSettings({ filters: { leads: { status: ["qualified"], region: ["North"] } } });
    const { filterState, activeFilterCount, hasActiveFilters } = useFilters("leads", defs);
    expect(filterState.value.status).toEqual(["qualified"]);
    expect(filterState.value.region).toEqual(["North"]);
    expect(activeFilterCount.value).toBe(2);
    expect(hasActiveFilters.value).toBe(true);
  });

  it("migrates legacy string values to array", () => {
    setUserSettings({ filters: { leads: { status: "qualified", region: "North" } } });
    const { filterState } = useFilters("leads", defs);
    expect(filterState.value.status).toEqual(["qualified"]);
    expect(filterState.value.region).toEqual(["North"]);
  });

  it("clearFilters resets all keys to default", () => {
    setUserSettings({ filters: { leads: { status: ["new"], region: ["Central"] } } });
    const { filterState, clearFilters, activeFilterCount } = useFilters("leads", defs);
    expect(activeFilterCount.value).toBe(2);
    clearFilters();
    expect(filterState.value).toEqual({ status: [], region: [] });
    expect(activeFilterCount.value).toBe(0);
  });

  it("persists to localStorage when filterState changes", async () => {
    const { filterState } = useFilters("leads", defs);
    filterState.value = { ...filterState.value, status: ["contacted"] };
    await nextTick();
    await new Promise((r) => setTimeout(r, 5));
    const s = getUserSettings();
    expect(s.filters?.leads?.status).toEqual(["contacted"]);
  });
});
