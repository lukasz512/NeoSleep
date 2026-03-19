import { describe, it, expect } from "vitest";
import { getApiUrl, REP_STORAGE_KEYS, SIDEBAR_DEFAULT_COLLAPSED } from "./constants";

describe("constants", () => {
  it("getApiUrl returns a string (empty in dev for proxy, or http URL)", () => {
    const url = getApiUrl();
    expect(typeof url).toBe("string");
    if (url.length > 0) {
      expect(url.startsWith("http")).toBe(true);
    }
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
