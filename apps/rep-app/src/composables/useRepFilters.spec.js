import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick } from "vue";
import { useRepFilters } from "./useRepFilters";
import { getRepSettings, setRepSettings } from "../utils/rep-settings";
import { REP_STORAGE_KEYS } from "../constants";
const storage = {};
const mockLocalStorage = {
    getItem: (key) => storage[key] ?? null,
    setItem: (key, value) => {
        storage[key] = value;
    },
    removeItem: (key) => {
        delete storage[key];
    },
};
const defs = [
    { key: "status", labelKey: "rep.leads.filters.status", type: "select", default: "" },
    { key: "region", labelKey: "rep.leads.filters.region", type: "select", default: "" },
];
describe("useRepFilters", () => {
    beforeEach(() => {
        if (typeof globalThis.localStorage === "undefined") {
            vi.stubGlobal("localStorage", mockLocalStorage);
        }
        delete storage[REP_STORAGE_KEYS.settings];
    });
    it("returns initial state from defaults when storage is empty", () => {
        const { filterState, activeFilterCount, hasActiveFilters } = useRepFilters("leads", defs);
        expect(filterState.value).toEqual({ status: [], region: [] });
        expect(activeFilterCount.value).toBe(0);
        expect(hasActiveFilters.value).toBe(false);
    });
    it("returns initial state from saved filters when storage has viewId", () => {
        setRepSettings({ filters: { leads: { status: ["qualified"], region: ["North"] } } });
        const { filterState, activeFilterCount, hasActiveFilters } = useRepFilters("leads", defs);
        expect(filterState.value.status).toEqual(["qualified"]);
        expect(filterState.value.region).toEqual(["North"]);
        expect(activeFilterCount.value).toBe(2);
        expect(hasActiveFilters.value).toBe(true);
    });
    it("migrates legacy string values to array", () => {
        setRepSettings({ filters: { leads: { status: "qualified", region: "North" } } });
        const { filterState } = useRepFilters("leads", defs);
        expect(filterState.value.status).toEqual(["qualified"]);
        expect(filterState.value.region).toEqual(["North"]);
    });
    it("clearFilters resets all keys to default", () => {
        setRepSettings({ filters: { leads: { status: ["new"], region: ["Central"] } } });
        const { filterState, clearFilters, activeFilterCount } = useRepFilters("leads", defs);
        expect(activeFilterCount.value).toBe(2);
        clearFilters();
        expect(filterState.value).toEqual({ status: [], region: [] });
        expect(activeFilterCount.value).toBe(0);
    });
    it("persists to localStorage when filterState changes", async () => {
        const { filterState } = useRepFilters("leads", defs);
        filterState.value = { ...filterState.value, status: ["contacted"] };
        await nextTick();
        await new Promise((r) => setTimeout(r, 5));
        const s = getRepSettings();
        expect(s.filters?.leads?.status).toEqual(["contacted"]);
    });
});
