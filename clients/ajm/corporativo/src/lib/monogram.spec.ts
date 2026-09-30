import { describe, expect, it } from "vitest";
import { MONO_PIN_SCREENS, monoStages } from "./monogram";

const at = (p: number) => monoStages(p);
const sweep = (fn: (p: number) => void) => {
  for (let p = 0; p <= 1.0001; p += 0.01) fn(Math.min(1, p));
};
/** the first progress (0.01 steps) where a stage is complete */
const first = (key: "guide" | "draw") => {
  for (let i = 0; i <= 100; i++) if (monoStages(i / 100)[key] === 1) return i / 100;
  return 1;
};

describe("monogram › the pinned AJ sketch (round 8)", () => {
  it("nothing is drawn until the page stops on it", () => {
    expect(at(0)).toMatchObject({ guide: 0, draw: 0, hatch: 0, fill: 0, guidesOut: 0, shift: 0, word: 0 });
  });
  it("skeleton first, then the outline, then hatching and ink", () => {
    expect(at(first("guide")).draw).toBeLessThan(1);
    expect(at(first("draw")).fill).toBe(0);
  });
  it("guide lines fade only once the logo is fully inked", () => {
    sweep((p) => {
      if (at(p).fill < 1) expect(at(p).guidesOut).toBe(0);
    });
    expect(at(1).guidesOut).toBe(1);
  });
  it("starts very large, reaches its size when the outline is done, then shrinks further, never growing back", () => {
    expect(at(0).zoom).toBeGreaterThanOrEqual(2.5);
    expect(at(first("draw")).zoom).toBe(1);
    expect(at(1).zoom).toBeLessThanOrEqual(0.55);
    let last = Infinity;
    sweep((p) => {
      expect(at(p).zoom).toBeLessThanOrEqual(last + 1e-9);
      last = at(p).zoom;
    });
  });
  it("settles smoothly: no sudden change of pace at the end", () => {
    const step = (p: number) => Math.abs(at(p + 0.01).zoom - at(p).zoom);
    expect(step(0.98)).toBeLessThan(0.004);
    expect(step(0.99)).toBeLessThan(0.002);
  });
  it("morph: once the guides are gone the mark slides left and 'Management' appears beside it", () => {
    sweep((p) => {
      if (at(p).guidesOut < 1) expect(at(p).shift).toBe(0);
      if (at(p).shift === 0) expect(at(p).word).toBe(0);
    });
    expect(at(1)).toMatchObject({ shift: 1, word: 1, fill: 1 });
  });
  it("holds the page for about two and a half scroll swipes", () => {
    expect(MONO_PIN_SCREENS).toBeGreaterThanOrEqual(2);
    expect(MONO_PIN_SCREENS).toBeLessThanOrEqual(3);
  });
});
