import { describe, expect, it } from "vitest";
import { parseReveal, penTiming, progressEntering, progressThrough, span01 } from "./motion";

describe("motion › pen timing", () => {
  it("nothing is written while the heading is still low on the screen", () => {
    expect(penTiming(0.1)).toEqual({ write: 0, draw: 0 });
  });
  it("the word is written before the marker starts", () => {
    const mid = penTiming(0.45);
    expect(mid.write).toBeGreaterThan(0.8);
    expect(mid.draw).toBe(0);
  });
  it("both are complete once the heading is in the upper third", () => {
    expect(penTiming(0.75)).toEqual({ write: 1, draw: 1 });
  });
  it("span01 maps and clamps", () => {
    expect(span01(5, 0, 10)).toBe(0.5);
    expect(span01(-1, 0, 10)).toBe(0);
    expect(span01(11, 0, 10)).toBe(1);
  });
});

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
