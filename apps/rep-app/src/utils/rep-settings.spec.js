import { describe, it, expect, beforeEach, vi } from "vitest";
import { getRepSettings, setRepSettings } from "./rep-settings";
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
describe("rep-settings", () => {
    beforeEach(() => {
        if (typeof globalThis.localStorage === "undefined") {
            vi.stubGlobal("localStorage", mockLocalStorage);
        }
        for (const k of Object.keys(storage))
            delete storage[k];
    });
    it("getRepSettings returns defaults when storage is empty", () => {
        const s = getRepSettings();
        expect(s.theme).toBe("light");
        expect(s.locale).toBe("en");
        expect(s.sidebarCollapsed).toBe(false);
        expect(s.filters).toEqual({});
    });
    it("setRepSettings persists and getRepSettings returns saved values", () => {
        setRepSettings({ theme: "dark", locale: "pl" });
        const s = getRepSettings();
        expect(s.theme).toBe("dark");
        expect(s.locale).toBe("pl");
    });
    it("setRepSettings merges filters per viewId (hcp, leads, etc.)", () => {
        setRepSettings({ filters: { hcp: { specialty: "Sleep medicine" } } });
        let s = getRepSettings();
        expect(s.filters?.hcp?.specialty).toBe("Sleep medicine");
        setRepSettings({ filters: { hcp: { region: "Mazovia" } } });
        s = getRepSettings();
        expect(s.filters?.hcp?.specialty).toBe("Sleep medicine");
        expect(s.filters?.hcp?.region).toBe("Mazovia");
        setRepSettings({ filters: { leads: { status: "qualified", region: "North" } } });
        s = getRepSettings();
        expect(s.filters?.leads?.status).toBe("qualified");
        expect(s.filters?.leads?.region).toBe("North");
    });
    it("getRepSettings with empty storage returns defaults without persisting", () => {
        const s = getRepSettings();
        expect(s.theme).toBe("light");
        expect(s.locale).toBe("en");
        if (typeof globalThis.localStorage !== "undefined") {
            const raw = globalThis.localStorage.getItem(REP_STORAGE_KEYS.settings);
            expect(raw).toBeNull();
        }
    });
});
