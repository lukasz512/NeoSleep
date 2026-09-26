import { describe, expect, it } from "vitest";
import {
  EXHALE_MS,
  INHALE_MS,
  INHALE_TRAVEL_MAX,
  WAVE_PERIOD_S,
  advanceWavePhase,
  deltaWave,
  dotVisibility,
  inhaleLook,
  inhaleOrder,
} from "./authDotChoreography";

describe("dotVisibility", () => {
  it("inhales every dot to zero within 1.5 s, the farthest one last", () => {
    expect(INHALE_MS).toBe(1500);
    expect(dotVisibility("inhale", INHALE_MS, 1, 1)).toBe(0);
    expect(dotVisibility("inhale", INHALE_MS, 0, 1)).toBe(0);
    // Halfway through, the nearest dot is gone while the farthest hasn't started.
    expect(dotVisibility("inhale", INHALE_MS / 2, 0, 1)).toBe(0);
    expect(dotVisibility("inhale", INHALE_MS / 2, 1, 1)).toBe(1);
  });

  it("exhales every dot back to full within 1.5 s", () => {
    expect(EXHALE_MS).toBe(1500);
    expect(dotVisibility("exhale", EXHALE_MS, 1, 0)).toBe(1);
    expect(dotVisibility("exhale", 0, 0, 0)).toBe(0);
  });

  it("reverses from where the dot is, without a jump, when an error lands mid-inhale", () => {
    const midInhale = dotVisibility("inhale", 600, 0.3, 1);
    expect(midInhale).toBeGreaterThan(0);
    expect(midInhale).toBeLessThan(1);
    expect(dotVisibility("exhale", 0, 0.3, midInhale)).toBe(midInhale);
  });

  it("leaves visibility untouched while idle", () => {
    expect(dotVisibility("idle", 99_999, 0.5, 0.42)).toBe(0.42);
  });
});

describe("inhaleOrder", () => {
  it("puts dots nearer the card first", () => {
    expect(inhaleOrder(0.1, 0.5)).toBeLessThan(inhaleOrder(0.9, 0.5));
  });

  it("stays within 0..1 even for out-of-range input", () => {
    expect(inhaleOrder(-1, -1)).toBe(0);
    expect(inhaleOrder(2, 2)).toBe(1);
  });
});

describe("inhaleLook", () => {
  it("draws nothing extra for a fully visible dot", () => {
    for (const mode of ["idle", "inhale", "exhale"] as const) {
      const look = inhaleLook(mode, 1, 300);
      expect(look.pull).toBeCloseTo(0);
      expect(look.radius).toBe(1);
      expect(look.opacity).toBe(1);
    }
  });

  it("caps the pull toward the card", () => {
    expect(inhaleLook("inhale", 0, 10_000).pull).toBe(INHALE_TRAVEL_MAX);
  });

  it("overshoots past home on the way out", () => {
    // easeOutBack passes 1 before settling: a negative pull means "beyond home, away from the card".
    expect(inhaleLook("exhale", 0.8, 500).pull).toBeLessThan(0);
  });

  it("glows only while being inhaled", () => {
    expect(inhaleLook("inhale", 0.5, 200).glow).toBeGreaterThan(0);
    expect(inhaleLook("exhale", 0.5, 200).glow).toBe(0);
  });
});

describe("delta wave", () => {
  it("advances the phase by one full turn per wave period", () => {
    expect(advanceWavePhase(0, WAVE_PERIOD_S * 1000)).toBeCloseTo(2 * Math.PI);
  });

  it("never jumps when the phase wraps", () => {
    const beforeWrap = 2 * Math.PI * 13 - 1e-6;
    const wrapped = advanceWavePhase(beforeWrap, 1);
    const a = deltaWave(120, 3, beforeWrap);
    const b = deltaWave(120, 3, wrapped);
    expect(Math.abs(a.offsetY - b.offsetY)).toBeLessThan(0.01);
  });

  it("keeps the offset within ±5.5 px and the crest within 0..1", () => {
    for (let x = 0; x < 1600; x += 37) {
      const { offsetY, crest } = deltaWave(x, x % 7, x / 100);
      expect(Math.abs(offsetY)).toBeLessThanOrEqual(5.5);
      expect(crest).toBeGreaterThanOrEqual(0);
      expect(crest).toBeLessThanOrEqual(1);
    }
  });
});
