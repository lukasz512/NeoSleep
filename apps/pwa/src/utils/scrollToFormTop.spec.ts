import { describe, it, expect, vi } from "vitest";
import { scrollToFormTop } from "./scrollToFormTop";

type FakeEl = Pick<Element, "scrollHeight" | "clientHeight" | "parentElement" | "scrollTo">;

/** Plain stand-in for a DOM Element — this suite runs under Vitest's "node" env (no jsdom). */
function makeEl(scrollHeight: number, clientHeight: number): FakeEl {
  return { scrollHeight, clientHeight, parentElement: null, scrollTo: vi.fn() };
}

describe("scrollToFormTop", () => {
  it("scrolls the nearest overflowing ancestor to top", () => {
    const scrollable = makeEl(1200, 600);
    const child = makeEl(400, 400);
    child.parentElement = scrollable as Element;

    scrollToFormTop(child as Element);

    expect(scrollable.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(child.scrollTo).not.toHaveBeenCalled();
  });

  it("does nothing when no ancestor overflows", () => {
    const parent = makeEl(400, 400);
    const child = makeEl(300, 300);
    child.parentElement = parent as Element;

    expect(() => scrollToFormTop(child as Element)).not.toThrow();
    expect(parent.scrollTo).not.toHaveBeenCalled();
  });

  it("is a no-op for null/undefined input", () => {
    expect(() => scrollToFormTop(null)).not.toThrow();
    expect(() => scrollToFormTop(undefined)).not.toThrow();
  });
});
