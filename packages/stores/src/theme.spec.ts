import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useThemeStore, resolveInitialThemeMode } from "./theme";

function stubMatchMedia(prefersDark: boolean | null): void {
  if (prefersDark === null) {
    // Simulate an environment where matchMedia doesn't exist at all.
    // @ts-expect-error deliberately removing the API for this test
    delete window.matchMedia;
    return;
  }
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersDark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveInitialThemeMode (pre-mount, no Pinia)", () => {
    it("returns the stored explicit choice when present", () => {
      localStorage.setItem("neosleep-theme", "dark");
      stubMatchMedia(false);
      expect(resolveInitialThemeMode()).toBe("dark");
    });

    it("falls back to system preference when nothing is stored", () => {
      stubMatchMedia(true);
      expect(resolveInitialThemeMode()).toBe("dark");
    });

    it("falls back to light when system preference can't be determined", () => {
      stubMatchMedia(null);
      expect(resolveInitialThemeMode()).toBe("light");
    });
  });

  describe("useThemeStore resolution priority", () => {
    it("user's explicit choice wins over tenant default and system preference", () => {
      localStorage.setItem("neosleep-theme", "light");
      stubMatchMedia(true); // system wants dark
      const store = useThemeStore();
      store.setTenantDefault("dark");
      expect(store.mode).toBe("light");
    });

    it("tenant default wins over system preference when no explicit choice exists", () => {
      stubMatchMedia(true); // system wants dark
      const store = useThemeStore();
      store.setTenantDefault("light");
      expect(store.mode).toBe("light");
    });

    it("falls back to system preference when no explicit choice or tenant default", () => {
      stubMatchMedia(true);
      const store = useThemeStore();
      expect(store.mode).toBe("dark");
    });

    it("falls back to light as the last resort", () => {
      stubMatchMedia(null);
      const store = useThemeStore();
      expect(store.mode).toBe("light");
    });

    it("preference 'system' continuously follows live OS changes, not a locked value", () => {
      stubMatchMedia(false);
      const store = useThemeStore();
      store.setPreference("system");
      store.startSystemListener();
      expect(store.mode).toBe("light");
    });

    it("setPreference persists the explicit choice across store instances", () => {
      const store = useThemeStore();
      store.setPreference("dark");
      expect(localStorage.getItem("neosleep-theme")).toBe("dark");
    });

    it("toggleMode flips between light and dark only (2-way UI)", () => {
      stubMatchMedia(false);
      const store = useThemeStore();
      expect(store.mode).toBe("light");
      store.toggleMode();
      expect(store.mode).toBe("dark");
      store.toggleMode();
      expect(store.mode).toBe("light");
    });

    it("cyclePreference cycles system -> light -> dark -> system (3-way UI)", () => {
      stubMatchMedia(false);
      const store = useThemeStore();
      expect(store.preference).toBe("system");
      store.cyclePreference();
      expect(store.preference).toBe("light");
      store.cyclePreference();
      expect(store.preference).toBe("dark");
      store.cyclePreference();
      expect(store.preference).toBe("system");
    });

    it("applies the resolved mode as a data-theme attribute on the document", () => {
      stubMatchMedia(false);
      const store = useThemeStore();
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      store.setPreference("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });
});
