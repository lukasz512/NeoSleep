import { describe, it, expect } from "vitest";
import { getBffUrl, REP_STORAGE_KEYS, SIDEBAR_DEFAULT_COLLAPSED } from "./constants";
describe("constants", () => {
    it("getBffUrl returns a non-empty URL string", () => {
        const url = getBffUrl();
        expect(typeof url).toBe("string");
        expect(url.length).toBeGreaterThan(0);
        expect(url.startsWith("http")).toBe(true);
    });
    it("REP_STORAGE_KEYS has settings key", () => {
        expect(REP_STORAGE_KEYS.settings).toBe("rep-app-settings");
    });
    it("storage key is non-empty string", () => {
        expect(typeof REP_STORAGE_KEYS.settings).toBe("string");
        expect(REP_STORAGE_KEYS.settings.length).toBeGreaterThan(0);
    });
    it("SIDEBAR_DEFAULT_COLLAPSED is false (sidebar open by default)", () => {
        expect(SIDEBAR_DEFAULT_COLLAPSED).toBe(false);
    });
});
