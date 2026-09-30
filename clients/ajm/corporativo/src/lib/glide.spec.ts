import { describe, expect, it } from "vitest";
import { glideBlur, glideCurve, glideDuration } from "./glide";

const slope = (t: number) => (glideCurve(t + 0.005) - glideCurve(t)) / 0.005;

describe("glide › slow take-off, fast flight, soft landing (round 8)", () => {
  it("starts where it is and ends exactly on the target", () => {
    expect(glideCurve(0)).toBe(0);
    expect(glideCurve(1)).toBe(1);
  });
  it("starts slowly: after a quarter of the time it has covered under 5 % of the way", () => {
    expect(glideCurve(0.25)).toBeLessThan(0.05);
  });
  it("flies: the middle is several times faster than an even pace", () => {
    const peak = Math.max(...[0.4, 0.5, 0.55, 0.6, 0.65, 0.7].map(slope));
    expect(peak).toBeGreaterThan(3);
  });
  it("never goes back or past the target", () => {
    let last = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = glideCurve(t);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      expect(v).toBeLessThanOrEqual(1);
      last = v;
    }
  });
  it("blurs only while moving fast, capped", () => {
    expect(glideBlur(0)).toBe(0);
    expect(glideBlur(0.5)).toBe(0); // a slow drift stays sharp
    expect(glideBlur(20)).toBeGreaterThan(4);
    expect(glideBlur(1000)).toBe(10);
  });
  it("long enough to see the flight: 1.1 s for a hop, up to 2 s across the page", () => {
    expect(glideDuration(100)).toBe(1100);
    expect(glideDuration(20000)).toBe(2000);
    expect(glideDuration(6000)).toBeGreaterThan(glideDuration(2000));
  });
});
