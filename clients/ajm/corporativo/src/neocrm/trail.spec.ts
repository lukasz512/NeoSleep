import { describe, expect, it } from "vitest";
import {
  FLIGHT_MS,
  ROUTE_WIDE,
  STORY,
  anchors,
  arc,
  collected,
  eventLift,
  eventX,
  fractionAt,
  glide,
  launchAt,
  launchStep,
  packAt,
  paperStrength,
  parcelSize,
  passProgress,
  pinProgress,
  planRoute,
  pushAway,
  routeFraction,
  star,
  tileNudge,
  trailMode,
  waitTop,
} from "./trail";

describe("neocrm page › the living paper's rules (CORE-215 rounds 7 to 11)", () => {
  it("less motion means nothing moves; no WebGL or a data saver keeps the flat object", () => {
    expect(trailMode({ reduced: true, saveData: false, webgl: true })).toBe("still");
    expect(trailMode({ reduced: false, saveData: false, webgl: false })).toBe("flat");
    expect(trailMode({ reduced: false, saveData: true, webgl: true })).toBe("flat");
    expect(trailMode({ reduced: false, saveData: false, webgl: true })).toBe("live");
  });

  it("on a phone the parcel stays small", () => {
    expect(parcelSize(390, 19.5)).toBeLessThanOrEqual(44);
  });
  it("the loose notes are bigger than in round 9 (66 px at most then)", () => {
    expect(parcelSize(1280, 48)).toBeGreaterThan(66);
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

// Round 11 (Łukasz 2026-11-17): the route follows from how the page is built, not from a fixed zigzag.
describe("neocrm page › the route comes from the page (CORE-215 round 11)", () => {
  const gutterOf = (width: number) => Math.min(48, Math.max(16, width * 0.05));
  const page = (width: number, over: Partial<Parameters<typeof planRoute>[0]> = {}) => ({
    width,
    gutter: gutterOf(width),
    x0: width * 0.58,
    channel: width >= 900 ? width * 0.37 : Number.NaN,
    gap: width >= 900 ? 120 : 0,
    start: 380,
    end: 9000,
    fanY: 2300,
    stampY: 5200,
    edges: [6400, 6700, 7000],
    ...over,
  });
  const after = (e: { at: number; span: number }) => e.at + e.span + 1;

  it("between events the parcel does not drift sideways", () => {
    for (const width of [390, 820, 1280]) {
      const { route } = planRoute(page(width));
      expect(eventX(380, route)).toBe(route.x0);
      expect(eventX((route.events[0]?.at ?? 0) - 1, route)).toBe(route.x0);
      route.events.forEach((e, i) => {
        const from = after(e);
        const to = (route.events[i + 1]?.at ?? 9000) - 1;
        if (to <= from) return;
        expect(eventX(from, route)).toBe(e.to);
        expect(eventX((from + to) / 2, route)).toBe(e.to);
        expect(eventX(to, route)).toBe(e.to);
      });
    }
  });
  it("a channel narrower than the parcel is not used: the catch keeps to the left margin", () => {
    const width = 1280;
    const size = parcelSize(width, gutterOf(width));
    const plan = planRoute({ ...page(width), channel: 477, gap: size - 20 });
    const catchEvent = plan.route.events.find((e) => e.kind === "catch");
    expect(catchEvent).toBeDefined();
    expect(catchEvent?.to).toBeLessThan(width * 0.2);
  });
  it("on a computer the catch takes it to the page's free channel, the fan to the right margin, the stamp back to the left", () => {
    for (const width of [ROUTE_WIDE, 820, 1280, 1920]) {
      const plan = planRoute(page(width));
      const half = parcelSize(width, gutterOf(width)) / 2;
      const big = (kind: string) => plan.route.events.find((e) => e.kind === kind) ?? { at: 0, span: 0, to: Number.NaN };
      if (width >= 900) expect(eventX(after(big("catch")), plan.route)).toBeCloseTo(width * 0.37);
      expect(eventX(after(big("fan")), plan.route)).toBeGreaterThan(width * 0.8);
      expect(eventX(after(big("stamp")), plan.route)).toBeLessThan(width * 0.2);
      // the fan stands at the left edge and blows to the right
      expect(plan.fan.dir).toBe(1);
      expect(plan.fan.x).toBeLessThan(width * 0.2);
      for (let y = 380; y <= 9000; y += 7) {
        expect(eventX(y, plan.route)).toBeGreaterThanOrEqual(half);
        expect(eventX(y, plan.route)).toBeLessThanOrEqual(width - half);
      }
    }
  });
  it("on a phone only the catch moves it, into the left margin", () => {
    const { route, fan } = planRoute(page(390));
    const caught = route.events.find((e) => e.kind === "catch");
    expect(caught).toBeDefined();
    for (let y = after(caught ?? { at: 0, span: 0 }); y <= 9000; y += 11) expect(eventX(y, route)).toBeLessThan(40);
    expect(new Set(route.events.map((e) => e.to)).size).toBe(1);
    expect(fan.dir).toBe(-1);
  });
  it("events lift the parcel: a hop at the fan, the stamp and at most three tile edges, and nothing in between", () => {
    const { route } = planRoute(page(1280));
    const bounces = route.events.filter((e) => e.kind === "bounce");
    expect(bounces.length).toBeGreaterThan(0);
    expect(bounces.length).toBeLessThanOrEqual(3);
    for (const e of route.events.filter((e) => e.kind !== "catch")) {
      expect(eventLift(e.at + e.span / 2, route)).toBeGreaterThan(0);
      expect(eventLift(e.at - 5, route)).toBe(0);
    }
    // a tile edge only knocks it a little
    let x = route.x0;
    for (const e of route.events) {
      if (e.kind === "bounce") expect(Math.abs(e.to - x)).toBeLessThanOrEqual(48);
      x = e.to;
    }
    // an edge under the fan or the stamp is not a second event
    expect(planRoute(page(1280, { edges: [2300, 5200] })).route.events.filter((e) => e.kind === "bounce")).toHaveLength(0);
  });

  it("packing is tied to the page: the fan finds the box open, the stamp seals it, in either section order", () => {
    const a = anchors(380, 9000, 2300, 5200);
    expect(packAt((2300 - 380) / 8620, a)).toBeCloseTo(STORY.fan);
    expect(packAt((5200 - 380) / 8620, a)).toBeCloseTo(STORY.stamp);
    expect(packAt(1, a)).toBe(STORY.sealed);
    expect(packAt(0, a)).toBe(0);
    expect(anchors(380, 9000, 5200, 2300)).toEqual(a);
    let last = -1;
    for (let f = 0; f <= 1.0001; f += 0.01) {
      expect(packAt(f, a)).toBeGreaterThanOrEqual(last);
      last = packAt(f, a);
    }
    for (const g of [0.05, 0.13, 0.25, 0.31, 0.5, 0.83]) expect(packAt(fractionAt(g, a), a)).toBeCloseTo(g);
    // the fan blows while the flaps are still open
    expect(STORY.gust[1]).toBeLessThan(0.46);
    // a page without those sections still packs the parcel on the way
    const bare = anchors(380, 9000, Number.NaN, Number.NaN);
    expect(bare.fan).toBeGreaterThan(0);
    expect(bare.stamp).toBeGreaterThan(bare.fan);
    expect(bare.stamp + bare.pad).toBeLessThan(1);
    // the notes always have room to be collected before the fan
    expect(anchors(380, 9000, 400, 500).fan * 8620).toBeGreaterThanOrEqual(519);
  });

  it("the box flies in on a parabola and picks the notes up one by one", () => {
    const from = { x: 600, y: 500 };
    const to = { x: 0, y: 0 };
    expect(arc(0, from, to, 240)).toEqual(from);
    expect(arc(1, from, to, 240)).toEqual(to);
    expect(arc(0.5, from, to, 240)).toEqual({ x: 300, y: 250 - 240 });
    // a parabola: the same bend all the way, and it comes down onto the notes from above
    const ys = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => arc(t, from, to, 240).y);
    for (let i = 2; i < ys.length; i++) expect((ys[i] ?? 0) - 2 * (ys[i - 1] ?? 0) + (ys[i - 2] ?? 0)).toBeCloseTo(19.2);
    expect(Math.min(...ys)).toBeLessThan(0);
    // it is there before the first note is picked up, and every note has its own moment
    expect(STORY.boxIn[1]).toBeLessThan(STORY.pickups[0]);
    expect(collected(STORY.boxIn[1])).toBe(0);
    STORY.pickups.forEach((at, i) => {
      expect(collected(at - 0.001)).toBe(i);
      expect(collected(at)).toBe(i + 1);
    });
    expect(STORY.pickups).toHaveLength(4);
    // one balloon, then the windmill, then two balloons
    expect(STORY.pickups[1]).toBeLessThan(STORY.gust[0]);
    expect(STORY.pickups[2]).toBeGreaterThan(STORY.gust[1]);
  });
  it("each pickup throws stars that fly up, fall and fade", () => {
    for (let i = 0; i < 6; i++) {
      expect(star(0, i, 6)).toMatchObject({ x: 0, y: 0, alpha: 1 });
      expect(star(0.15, i, 6).y).toBeLessThan(0);
      expect(star(0.85, i, 6).y).toBeGreaterThan(star(0.5, i, 6).y);
      expect(star(0.95, i, 6).alpha).toBe(0);
    }
    expect(star(0.3, 0, 6).x).toBeLessThan(0);
    expect(star(0.3, 5, 6).x).toBeGreaterThan(0);
  });

  it("each launch step lights up with scroll, and goes dark when the reader scrolls back", () => {
    expect([0, 0.2, 0.26, 0.5, 0.76, 1].map((p) => launchStep(p, 4))).toEqual([0, 0, 1, 2, 3, 3]);
    expect([0.76, 0.5, 0.1].map((p) => launchStep(p, 4))).toEqual([3, 2, 0]);
    expect(launchStep(Number.NaN, 4)).toBe(0);
    expect(launchStep(7, 4)).toBe(3);
    // pinned: from the moment the section sticks until it lets go
    expect(pinProgress(240, 1800, 300, 240)).toBe(0);
    expect(pinProgress(240 - 750, 1800, 300, 240)).toBeCloseTo(0.5);
    expect(pinProgress(-3000, 1800, 300, 240)).toBe(1);
    // not pinned: while the steps cross the middle half of the window
    expect(passProgress(700, 800)).toBe(0);
    expect(passProgress(400, 800)).toBeCloseTo(0.5);
    expect(passProgress(100, 800)).toBe(1);
  });

  it("the note waits in the hero until it is in the window, and the route ends in the window", () => {
    expect(waitTop(300, 800)).toBe(0);
    expect(waitTop(700, 640)).toBeCloseTo(316);
    for (const [start, end, range, height] of [
      [300, 9000, 9200, 800],
      [700, 6000, 6100, 640],
    ] as const) {
      const wait = waitTop(start, height);
      const launchTop = launchAt(end, range, height) * range;
      expect(routeFraction(0, wait, launchTop)).toBe(0);
      expect(routeFraction(wait, wait, launchTop)).toBe(0);
      expect(routeFraction(launchTop, wait, launchTop)).toBe(1);
      expect(routeFraction(range, wait, launchTop)).toBe(1);
      // where the parcel is in the window: on the note at first, 55 % down at the end, never outside in between
      for (let top = wait; top <= launchTop; top += 97) {
        const y = start + (end - start) * routeFraction(top, wait, launchTop) - top;
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(height);
      }
      expect(end - launchTop).toBeCloseTo(height * 0.55);
    }
    expect(launchAt(100, 0, 800)).toBe(0.97);
  });
});
