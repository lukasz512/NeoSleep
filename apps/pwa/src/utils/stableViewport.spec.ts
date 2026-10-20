import { describe, it, expect, afterEach, vi } from "vitest";
import { largeViewportHeight, onWidthResize } from "./stableViewport";

function resizeTo(width: number, height: number) {
  window.innerWidth = width;
  window.innerHeight = height;
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  window.innerWidth = 1024;
  window.innerHeight = 768;
});

describe("onWidthResize", () => {
  it("ignores a height-only resize (a phone browser hiding its URL bar mid-scroll)", () => {
    resizeTo(412, 915);
    const cb = vi.fn();
    const stop = onWidthResize(cb);
    resizeTo(412, 971);
    resizeTo(412, 915);
    expect(cb).not.toHaveBeenCalled();
    stop();
  });

  it("runs on a width change (rotation, window resize)", () => {
    resizeTo(412, 915);
    const cb = vi.fn();
    const stop = onWidthResize(cb);
    resizeTo(915, 412);
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops listening after cleanup", () => {
    resizeTo(412, 915);
    const cb = vi.fn();
    onWidthResize(cb)();
    resizeTo(800, 915);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("largeViewportHeight", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is the viewport with the URL bar hidden (100lvh), even while the bar is shown", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 971 } as DOMRect);
    window.innerHeight = 915;
    expect(largeViewportHeight()).toBe(971);
    expect(document.body.children.length).toBe(0); // the probe is removed
  });

  it("never reports less than what is visible right now", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 0 } as DOMRect);
    window.innerHeight = 700;
    expect(largeViewportHeight()).toBe(700);
  });

  it("falls back to innerHeight where lvh is unsupported", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    window.innerHeight = 640;
    expect(largeViewportHeight()).toBe(640);
  });
});
