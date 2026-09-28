import { describe, expect, it } from "vitest";
import { ENTRY_TIMING_MS, pickEntry } from "./entry";
import { isLiteMode } from "./capability";

describe("entry › picks entry by source, on every load", () => {
  it("QR arrival plays the QR entry", () => {
    expect(pickEntry({ search: "?src=qr", lite: false })).toBe("qr");
  });
  it("any other link plays the link entry", () => {
    expect(pickEntry({ search: "", lite: false })).toBe("link");
    expect(pickEntry({ search: "?utm_source=whatsapp", lite: false })).toBe("link");
  });
  it("weak device or connection gets a plain fade, even from QR", () => {
    expect(pickEntry({ search: "?src=qr", lite: true })).toBe("fade");
  });
  it("the page starts revealing before the overlay leaves, and no entry runs past 2.5 s", () => {
    for (const { open, done } of Object.values(ENTRY_TIMING_MS)) {
      expect(open).toBeLessThan(done);
      expect(done).toBeLessThanOrEqual(2500);
    }
  });
});

describe("capability › lite mode", () => {
  const strong = { reducedMotion: false, saveData: false, effectiveType: "4g", deviceMemory: 8, hardwareConcurrency: 8 };
  it("a strong device on 4G is not lite", () => {
    expect(isLiteMode(strong)).toBe(false);
  });
  it.each([
    ["prefers-reduced-motion", { reducedMotion: true }],
    ["Save-Data", { saveData: true }],
    ["3G", { effectiveType: "3g" }],
    ["2 GB RAM", { deviceMemory: 2 }],
    ["2 CPU cores", { hardwareConcurrency: 2 }],
  ])("%s → lite", (_name, override) => {
    expect(isLiteMode({ ...strong, ...override })).toBe(true);
  });
  it("unknown signals (Safari exposes none) do not force lite", () => {
    expect(isLiteMode({ reducedMotion: false, saveData: false })).toBe(false);
  });
});
