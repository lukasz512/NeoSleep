import { describe, it, expect } from "vitest";
import { deviceOrderProgress } from "./deviceOrderStage";

describe("deviceOrderProgress", () => {
  it("fills the ring step by step up to delivered", () => {
    expect(deviceOrderProgress("pending")).toBe(0.2);
    expect(deviceOrderProgress("shipped")).toBe(0.8);
    expect(deviceOrderProgress("delivered")).toBe(1);
  });

  it("draws no ring without a live order", () => {
    expect(deviceOrderProgress(null)).toBeNull();
    expect(deviceOrderProgress("cancelled")).toBeNull();
    expect(deviceOrderProgress("refunded")).toBeNull();
  });
});
