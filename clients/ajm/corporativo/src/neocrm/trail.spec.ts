import { describe, expect, it } from "vitest";
import { FLIGHT_MS, LAUNCH, ROUTE_WIDE, glide, launchAt, paperStrength, parcelSize, pushAway, routeShape, routeX, tileNudge, timeline, tipS, trailMode } from "./trail";

describe("neocrm page › the living paper's rules (CORE-215 rounds 7 to 10)", () => {
  it("less motion means nothing moves; no WebGL or a data saver keeps the flat object", () => {
    expect(trailMode({ reduced: true, saveData: false, webgl: true })).toBe("still");
    expect(trailMode({ reduced: false, saveData: false, webgl: false })).toBe("flat");
    expect(trailMode({ reduced: false, saveData: true, webgl: true })).toBe("flat");
    expect(trailMode({ reduced: false, saveData: false, webgl: true })).toBe("live");
  });

  it("on a computer the parcel swings between the free margins and never leaves the window", () => {
    for (const width of [ROUTE_WIDE, 820, 1280, 1920]) {
      const gutter = Math.min(48, Math.max(16, width * 0.05));
      const shape = routeShape(width, gutter);
      const half = parcelSize(width, gutter) / 2;
      let min = Infinity;
      let max = -Infinity;
      for (let s = 0; s < 6000; s += 13) {
        const x = routeX(s, shape, gutter);
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
      expect(min).toBeGreaterThanOrEqual(half);
      expect(max).toBeLessThanOrEqual(width - half);
      // it really crosses the page, both ways
      expect(min).toBeLessThan(width * 0.2);
      expect(max).toBeGreaterThan(width * 0.8);
    }
  });
  it("beside a 1120 px column the parcel rests in the middle of the free margin", () => {
    const shape = routeShape(1440, 48);
    expect(routeX(0, shape, 48)).toBeCloseTo(1440 - 104);
    expect(routeX(shape.wave / 2, shape, 48)).toBeCloseTo(104);
  });
  it("on a phone it keeps to the left margin", () => {
    const shape = routeShape(390, 19.5);
    for (let s = 0; s < 4000; s += 17) expect(routeX(s, shape, 19.5)).toBeLessThan(40);
    expect(parcelSize(390, 19.5)).toBeLessThanOrEqual(44);
  });
  it("the loose notes are bigger than in round 9 (66 px at most then)", () => {
    expect(parcelSize(1280, 48)).toBeGreaterThan(66);
  });

  it("the route ends while the parcel is still in the window, on a page of any length", () => {
    for (const [end, range, height] of [
      [9000, 9200, 800],
      [3000, 2600, 900],
      [20000, 20400, 700],
    ] as const) {
      const launch = launchAt(end, range, height);
      expect(timeline(launch, launch)).toBeCloseTo(LAUNCH);
      const y = tipS(timeline(launch, launch), height * 0.45, end) - launch * range;
      if (launch > 0.5 && launch < 0.97) expect(y).toBeCloseTo(height * 0.55);
    }
    expect(launchAt(100, 0, 800)).toBe(0.97);
  });
  it("the timeline starts at 0, ends at 1 and never runs backwards", () => {
    expect(timeline(0, 0.8)).toBe(0);
    expect(timeline(1, 0.8)).toBeCloseTo(1);
    expect(timeline(Number.NaN, 0.8)).toBe(0);
    expect(timeline(7, 0.8)).toBeCloseTo(1);
    let last = -1;
    for (let g = 0; g <= 1; g += 0.01) {
      expect(timeline(g, 0.8)).toBeGreaterThanOrEqual(last);
      last = timeline(g, 0.8);
    }
    expect(tipS(0, 360, 9000)).toBe(360);
    expect(tipS(1, 360, 9000)).toBe(9000);
  });

  it("the plane's flight runs on time, not on scroll: about three seconds, and back if the reader goes up", () => {
    let v = 0;
    for (let t = 0; t < 1000; t += 16) v = glide(v, 1, 16, FLIGHT_MS);
    expect(v).toBeLessThan(0.5);
    for (let t = 0; t < FLIGHT_MS; t += 16) v = glide(v, 1, 16, FLIGHT_MS);
    expect(v).toBe(1);
    expect(glide(1, 0, 16, FLIGHT_MS)).toBeLessThan(1);
    expect(glide(0.001, 0, 16, FLIGHT_MS)).toBe(0);
    expect(FLIGHT_MS).toBeGreaterThanOrEqual(2500);
  });

  it("dots move off the cursor and the parcel, only nearby", () => {
    expect(pushAway(200, 0, 130, 10)).toEqual({ x: 0, y: 0 });
    expect(pushAway(0, 0, 130, 10)).toEqual({ x: 0, y: 0 });
    const near = pushAway(10, 0, 130, 10);
    const far = pushAway(100, 0, 130, 10);
    expect(near.x).toBeGreaterThan(far.x);
    expect(far.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThanOrEqual(10);
    expect(pushAway(-10, 0, 130, 10).x).toBeLessThan(0);
  });
  it("the paper is fully alive in the hero and calmer under the text", () => {
    expect(paperStrength(0, 800)).toBe(1);
    expect(paperStrength(5000, 800)).toBeCloseTo(0.45);
  });
  it("a tile makes at most 4 px of room for the parcel, and none when it is far", () => {
    const tile = { x: 200, y: 1000, w: 300, h: 120 };
    expect(tileNudge(60, 500, tile)).toEqual({ x: 0, y: 0 });
    const beside = tileNudge(190, 1060, tile);
    expect(beside.x).toBeGreaterThan(3);
    expect(Math.abs(beside.y)).toBeLessThan(0.01);
    for (const [x, y] of [
      [190, 1060],
      [260, 1010],
      [350, 1060],
      [520, 1130],
    ] as const) {
      const n = tileNudge(x, y, tile);
      expect(Math.hypot(n.x, n.y)).toBeLessThanOrEqual(4.0001);
    }
    expect(Math.hypot(tileNudge(190, 1060, tile, 0.45).x)).toBeLessThan(2);
  });
});
