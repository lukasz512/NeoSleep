import { describe, it, expect } from "vitest";
import { hcoTypeIcon } from "./hcoLabels";

describe("hcoTypeIcon", () => {
  it("maps each known organization type to its distinct icon", () => {
    expect(hcoTypeIcon("clinic")).toBe("nav-hco");
    expect(hcoTypeIcon("hospital")).toBe("hco-hospital");
    expect(hcoTypeIcon("pharmacy")).toBe("hco-pharmacy");
    expect(hcoTypeIcon("practice")).toBe("hco-practice");
    expect(hcoTypeIcon("other")).toBe("hco-other");
  });

  it("uses distinct icons for practice (doctor) and any patient-facing icon", () => {
    expect(hcoTypeIcon("practice")).not.toBe("nav-patients");
  });

  it("falls back to the clinic icon for an unknown/missing type", () => {
    expect(hcoTypeIcon("something_new")).toBe("nav-hco");
    expect(hcoTypeIcon(undefined)).toBe("nav-hco");
  });
});
