import { describe, expect, it } from "vitest";
import { KINDS, gravity, rest, spring, target, type Input, type Vec } from "./physics";

const input = (o: Partial<Input> = {}): Input => ({ ux: 1, uy: 0, f: 1, hit: false, down: false, fx: 0, fy: 0, on: true, m: 1, z0: 0, ...o });

describe("per-element physics", () => {
  it("a note flees the pointer, the pencil is pulled towards it", () => {
    expect(target("repel", input()).x).toBeGreaterThan(0);
    expect(target("attract", input()).x).toBeLessThan(0);
  });

  it("glass swells towards the viewer, a key goes down when held and up when hovered", () => {
    const g = target("grow", input());
    expect(g.z).toBeGreaterThan(0);
    expect(g.s).toBeGreaterThan(1);
    expect(target("press", input({ hit: true })).z).toBeGreaterThan(0);
    expect(target("press", input({ down: true })).z).toBeLessThan(0);
  });

  it("every element rests at the identity pose when the pointer is away", () => {
    for (const k of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
      if (k === "follow") continue;
      const got = target(k, input({ f: 0, on: false }));
      for (const a of ["x", "y", "z", "s", "r"] as const) expect(Math.abs(got[a] - rest()[a])).toBe(0);
    }
  });

  it("plates spread by their depth, the plane follows the pointer", () => {
    expect(target("explode", input({ z0: 96 })).z).toBeGreaterThan(0);
    expect(target("explode", input({ z0: -96 })).z).toBeLessThan(0);
    expect(target("follow", input({ fx: 100 })).x).toBeGreaterThan(0);
  });

  it("every kind has its own spring, none are the same", () => {
    const sig = new Set(Object.values(KINDS).map((k) => `${k.k}/${k.c}`));
    expect(sig.size).toBe(Object.keys(KINDS).length);
  });

  it("a spring settles at its target", () => {
    const p = rest();
    const v: Vec = { x: 0, y: 0, z: 0, s: 0, r: 0 };
    const t = { ...rest(), x: 50 };
    let moving = true;
    for (let i = 0; i < 600 && moving; i++) moving = spring(p, v, t, "x", KINDS.repel.k, KINDS.repel.c);
    expect(moving).toBe(false);
    expect(p.x).toBeCloseTo(50, 0);
  });

  it("the dropped parcel bounces and comes to rest on the ground", () => {
    const p = rest();
    const v: Vec = { x: 0, y: 0, z: 0, s: 0, r: 0 };
    v.y = -13;
    let bounces = 0;
    let last = v.y;
    let moving = true;
    for (let i = 0; i < 400 && moving; i++) {
      moving = gravity(p, v);
      if (last > 0 && v.y < 0) bounces++;
      last = v.y;
    }
    expect(moving).toBe(false);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(p.y).toBe(0);
  });
});
