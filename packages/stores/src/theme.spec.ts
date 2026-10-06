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

    // NEO-102: "Auto" (follow the OS) is the default for anyone who never
    // picked — every tenant row has color_scheme='light', so letting it win
    // here would mean nobody ever starts on Auto.
    it("system preference wins over tenant default when no explicit choice exists (Auto by default)", () => {
      stubMatchMedia(true); // system wants dark
      const store = useThemeStore();
      store.setTenantDefault("light");
      expect(store.preference).toBe("system");
      expect(store.mode).toBe("dark");
    });

    it("tenant default applies only when the system preference can't be determined", () => {
      stubMatchMedia(null);
      const store = useThemeStore();
      store.setTenantDefault("dark");
      expect(store.mode).toBe("dark");
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

    // CORE-163: Auto must follow the device live without any app wiring.
    it("follows a live OS dark/light change in Auto without startSystemListener being called", () => {
      let onChange: ((e: { matches: boolean }) => void) | undefined;
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { onChange = cb; },
        removeEventListener: vi.fn(),
      }) as unknown as typeof window.matchMedia;
      const store = useThemeStore();
      expect(store.mode).toBe("light");
      onChange?.({ matches: true });
      expect(store.mode).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("applies the resolved mode as a data-theme attribute on the document", () => {
      stubMatchMedia(false);
      const store = useThemeStore();
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      store.setPreference("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  // CORE-163: the switch jumped because Vuetify/components changed before the
  // view transition took its "old" snapshot. Everything must flip inside the
  // update callback, and the un-naming flag must only live for the transition.
  describe("theme view transition", () => {
    type Update = () => Promise<void> | void;
    // Same cast as apps/pwa/src/router/pageTransitions.spec.ts: jsdom has no
    // startViewTransition, and the stub only needs `finished`.
    const doc = document as unknown as { startViewTransition?: unknown };

    afterEach(() => {
      delete doc.startViewTransition;
      document.documentElement.removeAttribute("data-theme-transition");
    });

    it("keeps mode on the old value until the transition's update callback runs", async () => {
      stubMatchMedia(false);
      let update: Update | undefined;
      let finish!: () => void;
      doc.startViewTransition = vi.fn((cb: Update) => {
        update = cb;
        return { finished: new Promise<void>((r) => { finish = r; }) };
      });
      const store = useThemeStore();
      store.setPreference("dark");

      expect(store.mode).toBe("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(document.documentElement.hasAttribute("data-theme-transition")).toBe(true);

      await update?.();
      expect(store.mode).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      finish();
      await Promise.resolve();
      await Promise.resolve();
      expect(document.documentElement.hasAttribute("data-theme-transition")).toBe(false);
    });

    it("an older transition finishing does not clear the flag of a newer one", async () => {
      stubMatchMedia(false);
      const finishers: (() => void)[] = [];
      doc.startViewTransition = vi.fn((cb: Update) => {
        void cb();
        return { finished: new Promise<void>((r) => finishers.push(r)) };
      });
      const store = useThemeStore();
      store.setPreference("dark");
      store.setPreference("light");
      finishers[0]!();
      await Promise.resolve();
      await Promise.resolve();
      expect(document.documentElement.hasAttribute("data-theme-transition")).toBe(true);
      finishers[1]!();
      await Promise.resolve();
      await Promise.resolve();
      expect(document.documentElement.hasAttribute("data-theme-transition")).toBe(false);
    });
  });
});
