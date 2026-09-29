import { describe, expect, it } from "vitest";
import { MONO_PIN_SCREENS, monoStages } from "./monogram";

describe("monogram › the pinned AJ sketch (round 8)", () => {
  it("nothing is drawn until the page stops on it", () => {
    expect(monoStages(0)).toMatchObject({ guide: 0, draw: 0, hatch: 0, fill: 0, guidesOut: 0 });
  });
  it("the whole skeleton is drawn before the outline finishes, and the outline before the ink", () => {
    const at = (p: number) => monoStages(p);
    expect(at(0.36).guide).toBe(1);
    expect(at(0.36).draw).toBeLessThan(1);
    expect(at(0.56).draw).toBe(1);
    expect(at(0.56).fill).toBe(0);
  });
  it("guide lines fade only once the logo is fully inked, and are gone before the page moves on", () => {
    const inked = [0.5, 0.6, 0.7, 0.8].find((p) => monoStages(p).fill === 1) ?? 1;
    for (let p = 0; p < inked; p += 0.02) expect(monoStages(p).guidesOut).toBe(0);
    expect(monoStages(0.95).guidesOut).toBe(1);
    expect(monoStages(1)).toEqual({ guide: 1, draw: 1, hatch: 1, fill: 1, guidesOut: 1, zoom: 1 });
  });
  it("the blueprint starts very large and shrinks to its size while it is drawn (round 8)", () => {
    expect(monoStages(0).zoom).toBeGreaterThanOrEqual(2.5);
    let last = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const z = monoStages(p).zoom;
      expect(z).toBeLessThanOrEqual(last);
      last = z;
    }
    expect(monoStages(0.56).zoom).toBe(1); // at its size once the outline is complete
  });
  it("holds the page for about two scroll swipes", () => {
    expect(MONO_PIN_SCREENS).toBeGreaterThanOrEqual(1.5);
    expect(MONO_PIN_SCREENS).toBeLessThanOrEqual(2.5);
  });
});
