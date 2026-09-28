import { describe, expect, it } from "vitest";
import { parseReveal, progressEntering, progressThrough } from "./motion";

describe("motion › reveal options", () => {
  it("defaults to a rise with no delay", () => {
    expect(parseReveal(undefined)).toEqual({ variant: "up", delay: 0 });
  });
  it("accepts a variant name or a variant + delay", () => {
    expect(parseReveal("wipe")).toEqual({ variant: "wipe", delay: 0 });
    expect(parseReveal({ delay: 120 })).toEqual({ variant: "up", delay: 120 });
    expect(parseReveal({ variant: "scale", delay: 90 })).toEqual({ variant: "scale", delay: 90 });
  });
});

describe("motion › scroll progress", () => {
  it("through a pinned section: 0 at its top, 1 once its bottom meets the viewport bottom", () => {
    expect(progressThrough(0, 3000, 1000)).toBe(0);
    expect(progressThrough(-1000, 3000, 1000)).toBe(0.5);
    expect(progressThrough(-2000, 3000, 1000)).toBe(1);
    expect(progressThrough(-5000, 3000, 1000)).toBe(1);
  });
  it("a section no taller than the viewport jumps straight from 0 to 1", () => {
    expect(progressThrough(10, 800, 1000)).toBe(0);
    expect(progressThrough(-10, 800, 1000)).toBe(1);
  });
  it("entering: 0 at the viewport bottom, 1 at the top, clamped", () => {
    expect(progressEntering(1000, 1000)).toBe(0);
    expect(progressEntering(500, 1000)).toBe(0.5);
    expect(progressEntering(0, 1000)).toBe(1);
    expect(progressEntering(-400, 1000)).toBe(1);
    expect(progressEntering(1600, 1000)).toBe(0);
  });
});
