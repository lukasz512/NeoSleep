import { describe, expect, it } from "vitest";
import { PEN_MS, PEN_TOTAL_MS, parseReveal, penTiming, progressEntering, progressThrough, span01 } from "./motion";

describe("motion › pen timing", () => {
  it("nothing is written until the line has landed", () => {
    expect(penTiming(0)).toEqual({ write: 0, draw: 0 });
    expect(penTiming(PEN_MS.delay)).toEqual({ write: 0, draw: 0 });
  });
  it("the marker never starts before the word is fully written (one after the other)", () => {
    for (let ms = 0; ms <= PEN_TOTAL_MS; ms += 10) {
      const t = penTiming(ms);
      if (t.draw > 0) expect(t.write).toBe(1);
    }
  });
  it("the word writes continuously forward", () => {
    let last = 0;
    for (let ms = 0; ms <= PEN_TOTAL_MS; ms += 10) {
      const { write } = penTiming(ms);
      expect(write).toBeGreaterThanOrEqual(last);
      last = write;
    }
  });
  it("both are complete within 2.5 s and stay complete", () => {
    expect(PEN_TOTAL_MS).toBeLessThanOrEqual(2500);
    expect(penTiming(PEN_TOTAL_MS)).toEqual({ write: 1, draw: 1 });
    expect(penTiming(60_000)).toEqual({ write: 1, draw: 1 });
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
