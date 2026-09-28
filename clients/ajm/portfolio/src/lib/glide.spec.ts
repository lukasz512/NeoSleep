import { describe, expect, it } from "vitest";
import { glideCurve, glideDuration } from "./glide";

describe("glide › lift and drop", () => {
  it("starts where it is and ends exactly on the target", () => {
    expect(glideCurve(0)).toBe(0);
    expect(glideCurve(1)).toBe(1);
  });
  it("lifts first: a small move back before it travels (never more than 3 % of the way)", () => {
    const early = [0.02, 0.05, 0.08, 0.1].map(glideCurve);
    expect(Math.min(...early)).toBeLessThan(0);
    expect(Math.min(...early)).toBeGreaterThan(-0.03);
  });
  it("drops onto the target with a small settle past it (never more than 3 %)", () => {
    const late = [0.85, 0.9, 0.93, 0.96].map(glideCurve);
    expect(Math.max(...late)).toBeGreaterThan(1);
    expect(Math.max(...late)).toBeLessThan(1.03);
  });
  it("longer jumps take longer, but always between 0.9 s and 1.8 s", () => {
    expect(glideDuration(100)).toBe(900);
    expect(glideDuration(20000)).toBe(1800);
    expect(glideDuration(3000)).toBeGreaterThan(glideDuration(1500));
  });
});
