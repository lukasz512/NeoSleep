import { describe, expect, it } from "vitest";
import { magnetPull } from "./magnet";

describe("magnet › the AJ is drawn toward the pointer (round 8)", () => {
  it("does not move when the pointer is on its centre or far away", () => {
    expect(magnetPull(0, 0)).toEqual({ x: 0, y: 0 });
    expect(magnetPull(900, 0)).toEqual({ x: 0, y: 0 });
  });
  it("moves toward the pointer, on both axes", () => {
    const p = magnetPull(120, -80);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(0);
  });
  it("pulls hardest at mid range and never jumps onto the pointer", () => {
    const near = Math.hypot(...Object.values(magnetPull(40, 0)));
    const mid = Math.hypot(...Object.values(magnetPull(200, 0)));
    const edge = Math.hypot(...Object.values(magnetPull(520, 0)));
    expect(mid).toBeGreaterThan(near);
    expect(mid).toBeGreaterThan(edge);
    for (const d of [10, 100, 200, 300, 500]) expect(magnetPull(d, 0).x).toBeLessThan(d);
  });
  it("is capped at 60 px", () => {
    for (const d of [100, 200, 300, 400]) expect(Math.hypot(...Object.values(magnetPull(d, d)))).toBeLessThanOrEqual(60);
  });
});
