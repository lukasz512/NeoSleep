import { describe, it, expect } from "vitest";
import { getApiUrl, APP_STORAGE_KEYS, SIDEBAR_DEFAULT_COLLAPSED } from "./constants";

describe("constants", () => {
  it("getApiUrl returns a string (empty in dev for proxy, or http URL)", () => {
    const url = getApiUrl();
    expect(typeof url).toBe("string");
    if (url.length > 0) {
      expect(url.startsWith("http")).toBe(true);
    }
  });

  it("APP_STORAGE_KEYS has settings key", () => {
    expect(APP_STORAGE_KEYS.settings).toBe("app-settings");
  });

  it("storage key is non-empty string", () => {
    expect(typeof APP_STORAGE_KEYS.settings).toBe("string");
    expect(APP_STORAGE_KEYS.settings.length).toBeGreaterThan(0);
  });

  it("SIDEBAR_DEFAULT_COLLAPSED is false (sidebar open by default)", () => {
    expect(SIDEBAR_DEFAULT_COLLAPSED).toBe(false);
  });
});
