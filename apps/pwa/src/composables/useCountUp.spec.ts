import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useCountUp } from "./useCountUp";

/** NEO-239: indicators count up from 0, one after another. */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
});
afterEach(() => {
  vi.useRealTimers();
});

function counter(delayMs: number) {
  const scope = effectScope();
  const enabled = ref(false);
  const shown = scope.run(() => useCountUp(ref(100), 1000, enabled, delayMs))!;
  return { shown, enabled, stop: () => scope.stop() };
}

describe("useCountUp", () => {
  it("holds at 0 until enabled, then counts up to the target", async () => {
    const c = counter(0);
    vi.advanceTimersByTime(500);
    expect(c.shown.value).toBe(0);
    c.enabled.value = true;
    await nextTick();
    vi.advanceTimersByTime(300);
    expect(c.shown.value).toBeGreaterThan(0);
    expect(c.shown.value).toBeLessThan(100);
    vi.advanceTimersByTime(1000);
    expect(c.shown.value).toBe(100);
    c.stop();
  });

  it("a later indicator starts after its delay; the first one is already counting", async () => {
    const first = counter(0);
    const fourth = counter(450);
    first.enabled.value = true;
    fourth.enabled.value = true;
    await nextTick();
    vi.advanceTimersByTime(300);
    expect(first.shown.value).toBeGreaterThan(0);
    expect(fourth.shown.value).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(fourth.shown.value).toBe(100);
    first.stop();
    fourth.stop();
  });

  it("reduced motion shows the target at once", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    try {
      const c = counter(450);
      expect(c.shown.value).toBe(100);
      c.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
