import { describe, it, expect } from "vitest";
import { collapseProgress, collapseVars, settleTarget, DOCK, type CollapseGeometry } from "./useRecordHeaderCollapse";

// NEO-181: the numbers behind the scroll-driven collapse of the phone header.

const geometry = (over: Partial<CollapseGeometry> = {}): CollapseGeometry => ({
  height: 120,
  avatar: { x: 0, y: 8, size: 48 },
  title: { x: 64, y: 14, fontPx: 24, lineHeight: 32, textWidth: 200, rowWidth: 270 },
  fadeTop: 50,
  room: 180,
  ...over,
});

const n = (v: string) => parseFloat(v);

describe("collapseVars", () => {
  it("lands the avatar at icon size, centred in the 48 px row next to ‹", () => {
    const g = geometry();
    const v = collapseVars(g);
    const s = n(v["--rh-av-s"]);
    expect(s * g.avatar.size).toBeCloseTo(DOCK.avatar, 1);
    expect(g.avatar.x + n(v["--rh-av-dx"])).toBe(DOCK.avatarX);
    // Resting y + move = where the row sits inside the header once it has pinned (height − 48) + centring.
    expect(g.avatar.y + n(v["--rh-av-dy"])).toBe(g.height - DOCK.row + (DOCK.row - DOCK.avatar) / 2);
  });

  it("docks the name at 15 px, vertically centred, after the avatar", () => {
    const g = geometry();
    const v = collapseVars(g);
    const s = n(v["--rh-nm-s"]);
    expect(s * g.title.fontPx).toBeCloseTo(DOCK.titlePx, 1);
    expect(g.title.x + n(v["--rh-nm-dx"])).toBe(DOCK.titleX);
    const top = g.title.y + n(v["--rh-nm-dy"]) - (g.height - DOCK.row);
    expect(top + (g.title.lineHeight * s) / 2).toBeCloseTo(DOCK.row / 2, 1);
  });

  it("shrinks a long name further to fit before the actions, but not below 13 px", () => {
    const tight = collapseVars(geometry({ room: 110, title: { x: 64, y: 14, fontPx: 24, lineHeight: 32, textWidth: 190, rowWidth: 190 } }));
    expect(n(tight["--rh-nm-s"]) * 190).toBeLessThanOrEqual(110.5);
    const huge = collapseVars(geometry({ title: { x: 64, y: 14, fontPx: 24, lineHeight: 32, textWidth: 2000, rowWidth: 270 } }));
    expect(n(huge["--rh-nm-s"]) * 24).toBeCloseTo(DOCK.titleMinPx, 1);
  });

  it("narrows the name's box as it docks so a name too long even at 13 px ends in … before the actions", () => {
    const g = geometry({ room: 110, title: { x: 64, y: 14, fontPx: 24, lineHeight: 32, textWidth: 2000, rowWidth: 270 } });
    const v = collapseVars(g);
    expect(n(v["--rh-nm-w0"])).toBe(270);
    expect(n(v["--rh-nm-w1"]) * n(v["--rh-nm-s"])).toBeCloseTo(110, 0);
  });

  it("uses the whole header height as the collapse distance", () => {
    expect(collapseVars(geometry({ height: 137 }))["--rh-R"]).toBe("137px");
  });
});

describe("collapseProgress", () => {
  it("is 0 before the toolbar pins, 1 once the header has docked, linear between", () => {
    expect(collapseProgress(10, 20, 100)).toBe(0);
    expect(collapseProgress(70, 20, 100)).toBe(0.5);
    expect(collapseProgress(400, 20, 100)).toBe(1);
  });
});

describe("settleTarget", () => {
  it("leaves a fully open or fully docked header alone", () => {
    expect(settleTarget(20, 20, 100, 2000)).toBeNull();
    expect(settleTarget(120, 20, 100, 2000)).toBeNull();
    expect(settleTarget(900, 20, 100, 2000)).toBeNull();
  });

  it("finishes whichever way is closer", () => {
    expect(settleTarget(40, 20, 100, 2000)).toBe(20);
    expect(settleTarget(90, 20, 100, 2000)).toBe(120);
  });

  it("returns to open when the page is too short to dock", () => {
    expect(settleTarget(90, 20, 100, 95)).toBe(20);
  });
});
