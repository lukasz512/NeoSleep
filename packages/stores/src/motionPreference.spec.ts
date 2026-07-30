import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMotionPreferenceStore } from "./motionPreference";

function stubMatchMedia(prefersReduced: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersReduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

function stubConnection(overrides: { saveData?: boolean; effectiveType?: string } | undefined): void {
  Object.defineProperty(navigator, "connection", {
    value: overrides ? { ...overrides, addEventListener: vi.fn() } : undefined,
    configurable: true,
  });
}

function stubDeviceMemory(value: number | undefined): void {
  Object.defineProperty(navigator, "deviceMemory", { value, configurable: true });
}

function stubHardwareConcurrency(value: number | undefined): void {
  Object.defineProperty(navigator, "hardwareConcurrency", { value, configurable: true });
}

describe("motion preference store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    stubMatchMedia(false);
    stubConnection(undefined);
    stubDeviceMemory(undefined);
    stubHardwareConcurrency(8);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves to full motion when nothing indicates otherwise", () => {
    const store = useMotionPreferenceStore();
    expect(store.shouldReduceMotion).toBe(false);
  });

  it("reduces motion when the OS prefers-reduced-motion is set", () => {
    stubMatchMedia(true);
    const store = useMotionPreferenceStore();
    expect(store.shouldReduceMotion).toBe(true);
  });

  it("reduces motion when the connection reports saveData", () => {
    stubConnection({ saveData: true });
    const store = useMotionPreferenceStore();
    expect(store.shouldReduceMotion).toBe(true);
  });

  it("reduces motion on a slow effectiveType", () => {
    stubConnection({ effectiveType: "2g" });
    const store = useMotionPreferenceStore();
    expect(store.shouldReduceMotion).toBe(true);
  });

  it("reduces motion on low deviceMemory", () => {
    stubDeviceMemory(1);
    const store = useMotionPreferenceStore();
    expect(store.shouldReduceMotion).toBe(true);
  });

  it("reduces motion on low hardwareConcurrency", () => {
    stubHardwareConcurrency(2);
    const store = useMotionPreferenceStore();
    expect(store.shouldReduceMotion).toBe(true);
  });

  it("explicit 'full' override wins over OS and heuristic signals", () => {
    stubMatchMedia(true);
    stubConnection({ saveData: true });
    const store = useMotionPreferenceStore();
    store.setPreference("full");
    expect(store.shouldReduceMotion).toBe(false);
  });

  it("explicit 'reduced' override wins even when nothing else indicates low power", () => {
    const store = useMotionPreferenceStore();
    store.setPreference("reduced");
    expect(store.shouldReduceMotion).toBe(true);
  });

  it("persists the explicit preference across store instances", () => {
    const store = useMotionPreferenceStore();
    store.setPreference("reduced");
    expect(localStorage.getItem("neosleep-motion-preference")).toBe("reduced");

    setActivePinia(createPinia());
    const freshStore = useMotionPreferenceStore();
    expect(freshStore.preference).toBe("reduced");
    expect(freshStore.shouldReduceMotion).toBe(true);
  });

  it("startListening picks up a live OS preference change", () => {
    const store = useMotionPreferenceStore();
    let changeHandler: ((e: { matches: boolean }) => void) | undefined;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;

    store.startListening();
    expect(store.shouldReduceMotion).toBe(false);

    changeHandler?.({ matches: true });
    expect(store.shouldReduceMotion).toBe(true);
  });
});
