import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useVisiblePolling } from "./useVisiblePolling";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

function mountPolling(interval: () => number | null) {
  const tick = vi.fn(async () => undefined);
  const wrapper = mount(defineComponent({ setup: () => (useVisiblePolling(interval, tick), () => h("div")) }));
  return { tick, wrapper };
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useVisiblePolling (NEO-173)", () => {
  it("ticks every interval while visible, and stops on unmount", async () => {
    const { tick, wrapper } = mountPolling(() => 60_000);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("sends nothing while hidden, and checks at once on coming back", async () => {
    const { tick } = mountPolling(() => 15_000);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(tick).not.toHaveBeenCalled();
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("a shorter interval takes effect right away (a link went live)", async () => {
    const fast = ref(false);
    const { tick } = mountPolling(() => (fast.value ? 15_000 : 60_000));
    await vi.advanceTimersByTimeAsync(10_000);
    fast.value = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
