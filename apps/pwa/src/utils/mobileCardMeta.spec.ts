import { describe, it, expect } from "vitest";
import { hcpCardMeta, kindPascal, territoryCardMeta, treatmentPlanCardMeta, sleepStudyCardMeta } from "./mobileCardMeta";

const translate = (key: string) => `T:${key}`;

describe("hcpCardMeta", () => {
  it("shows the territory (the institution is rendered separately as an EntityLink)", () => {
    expect(hcpCardMeta({ territory_name: "Mazowieckie" })).toBe("Mazowieckie");
  });

  it("falls back to region when territory_name is missing", () => {
    expect(hcpCardMeta({ territory_name: null, region: "PL" })).toBe("PL");
  });

  it("returns an empty string when neither field is present", () => {
    expect(hcpCardMeta({})).toBe("");
  });
});

describe("kindPascal", () => {
  it("pascal-cases a snake-free territory kind", () => {
    expect(kindPascal("region")).toBe("Region");
    expect(kindPascal("district")).toBe("District");
  });
});

describe("territoryCardMeta", () => {
  it("joins the translated kind, country code, and code", () => {
    expect(territoryCardMeta({ kind: "region", country_code: "PL", code: "MZ" }, translate)).toBe(
      "T:user.territories.form.kindRegion — PL — MZ",
    );
  });

  it("omits the code segment when the territory has none", () => {
    expect(territoryCardMeta({ kind: "district", country_code: "MX", code: null }, translate)).toBe(
      "T:user.territories.form.kindDistrict — MX",
    );
  });
});

describe("treatmentPlanCardMeta", () => {
  const typeLabel = (type?: string) => (type ? `Type:${type}` : "—");

  it("shows the translated type (the dentist is rendered separately as an EntityLink)", () => {
    expect(treatmentPlanCardMeta({ type: "cpap" }, typeLabel)).toBe("Type:cpap");
  });

  it("returns an empty string when the type is missing", () => {
    expect(treatmentPlanCardMeta({}, typeLabel)).toBe("");
  });
});

describe("sleepStudyCardMeta", () => {
  const studyTypeLabel = (studyType?: string) => (studyType ? `Study:${studyType}` : "—");

  it("joins study type, formatted date, and AHI (translated label); the interpreter is an EntityLink", () => {
    const result = sleepStudyCardMeta(
      { study_type: "home", study_date: "2026-01-15T00:00:00.000Z", ahi_score: 12.5 },
      studyTypeLabel,
      translate,
    );
    expect(result).toContain("Study:home");
    expect(result).toContain("T:app.sleepStudies.table.ahiScore 12.5");
  });

  it("omits AHI when the score is null, without leaving a dangling separator", () => {
    const result = sleepStudyCardMeta({ study_type: "home", ahi_score: null }, studyTypeLabel, translate);
    expect(result).toBe("Study:home");
  });

  it("returns an empty string when nothing is present", () => {
    expect(sleepStudyCardMeta({}, studyTypeLabel, translate)).toBe("");
  });
});
