import { describe, it, expect } from "vitest";
import { formatDiagnosis } from "./diagnosis";

describe("formatDiagnosis (NEO-153)", () => {
  it("returns null when nothing is recorded", () => {
    expect(formatDiagnosis(null)).toBeNull();
    expect(formatDiagnosis({})).toBeNull();
    expect(formatDiagnosis({ codes: [] })).toBeNull();
    expect(formatDiagnosis("  ")).toBeNull();
  });

  it("shows a code with its label", () => {
    expect(formatDiagnosis({ code: "G47.33", label: "Obstructive sleep apnea" })).toBe("G47.33 · Obstructive sleep apnea");
    expect(formatDiagnosis({ code: "G47.33", description: "OSA" })).toBe("G47.33 · OSA");
  });

  it("shows a bare code or a bare string", () => {
    expect(formatDiagnosis({ code: "G47.33" })).toBe("G47.33");
    expect(formatDiagnosis("G47.33")).toBe("G47.33");
  });

  it("joins several codes", () => {
    expect(formatDiagnosis({ codes: [{ code: "G47.33" }, "E66.9"] })).toBe("G47.33, E66.9");
    expect(formatDiagnosis([{ code: "G47.33", label: "OSA" }])).toBe("G47.33 · OSA");
  });
});
