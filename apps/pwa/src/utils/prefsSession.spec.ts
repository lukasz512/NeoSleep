import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick } from "vue";
import { prefsKey, readPref } from "@prefs";
import { APP_STORAGE_KEYS } from "../constants";
import type * as SessionModule from "./prefsSession";

const alice = { tenant: "acme", userId: "u-1" };
let session: typeof SessionModule;

describe("prefsSession", () => {
  // user-settings.ts keeps a module-level useLocalStorage() singleton — fresh modules per test.
  // Import after the test has put the old data in storage, like a real page load.
  const load = async () => (session = await import("./prefsSession"));
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  describe("migrateLegacyFilters", () => {
    it("moves the old shared app-settings filters into the signed-in user's slots, once", async () => {
      localStorage.setItem(
        APP_STORAGE_KEYS.settings,
        JSON.stringify({ locale: "pl", filters: { leads: { status: ["new"] }, hcp: { region: "North" } } }),
      );
      await load();
      session.migrateLegacyFilters(alice);
      expect(readPref(localStorage, prefsKey(alice, "view:leads:filters"))).toEqual({ status: ["new"] });
      expect(readPref(localStorage, prefsKey(alice, "view:hcp:filters"))).toEqual({ region: "North" });
      await nextTick(); // useLocalStorage writes on the next tick
      const settings = JSON.parse(localStorage.getItem(APP_STORAGE_KEYS.settings)!);
      expect(settings.filters).toBeUndefined();
      expect(settings.locale).toBe("pl");
    });

    it("never overwrites filters the user already has in the new format", async () => {
      localStorage.setItem(prefsKey(alice, "view:leads:filters"), JSON.stringify({ v: { status: ["mine"] }, at: Date.now() }));
      localStorage.setItem(APP_STORAGE_KEYS.settings, JSON.stringify({ filters: { leads: { status: ["old"] } } }));
      await load();
      session.migrateLegacyFilters(alice);
      expect(readPref(localStorage, prefsKey(alice, "view:leads:filters"))).toEqual({ status: ["mine"] });
    });

    it("does nothing when there is nothing to migrate", async () => {
      await load();
      session.migrateLegacyFilters(alice);
      expect(localStorage.length).toBe(0);
    });
  });

  describe("per-person language", () => {
    it("is saved for the signed-in user and read back only for them", async () => {
      await load();
      session.saveUserLocale(alice, "mx");
      expect(session.readUserLocale(alice)).toBe("mx");
      expect(session.readUserLocale({ tenant: "acme", userId: "u-2" })).toBeNull();
    });

    it("ignores a stored value that isn't a supported language", async () => {
      localStorage.setItem(prefsKey(alice, "locale"), JSON.stringify({ v: "xx", at: Date.now() }));
      await load();
      expect(session.readUserLocale(alice)).toBeNull();
    });
  });
});
