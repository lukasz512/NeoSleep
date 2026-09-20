import { describe, it, expect } from "vitest";
import { hcpCardMeta, kindPascal, territoryCardMeta, treatmentPlanCardMeta, sleepStudyCardMeta } from "./mobileCardMeta";

const translate = (key: string) => `T:${key}`;

describe("hcpCardMeta", () => {
  it("joins institution and territory, same data the desktop table shows in separate columns", () => {
    expect(hcpCardMeta({ institution: "Klinika Zdrowie", territory_name: "Mazowieckie" })).toBe("Klinika Zdrowie · Mazowieckie");
  });

  it("falls back to region when territory_name is missing", () => {
    expect(hcpCardMeta({ institution: "Klinika Zdrowie", territory_name: null, region: "PL" })).toBe("Klinika Zdrowie · PL");
  });

  it("returns an em dash when neither field is present", () => {
    expect(hcpCardMeta({})).toBe("—");
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

  it("joins the translated type and dentist name", () => {
    expect(treatmentPlanCardMeta({ type: "cpap", dentist_name: "Dr. Nowak" }, typeLabel)).toBe("Type:cpap · Dr. Nowak");
  });

  it("returns an em dash when neither field is present", () => {
    expect(treatmentPlanCardMeta({}, typeLabel)).toBe("—");
  });
});

describe("sleepStudyCardMeta", () => {
  const studyTypeLabel = (studyType?: string) => (studyType ? `Study:${studyType}` : "—");

  it("joins study type, formatted date, AHI (translated label), and interpreter", () => {
    const result = sleepStudyCardMeta(
      { study_type: "home", study_date: "2026-01-15T00:00:00.000Z", ahi_score: 12.5, interpreted_by_name: "Dr. Kowalski" },
      studyTypeLabel,
      translate,
    );
    expect(result).toContain("Study:home");
    expect(result).toContain("T:app.sleepStudies.table.ahiScore 12.5");
    expect(result).toContain("Dr. Kowalski");
  });

  it("omits AHI when the score is null, without leaving a dangling separator", () => {
    const result = sleepStudyCardMeta({ study_type: "home", ahi_score: null }, studyTypeLabel, translate);
    expect(result).toBe("Study:home");
  });

  it("returns an em dash when nothing is present", () => {
    expect(sleepStudyCardMeta({}, studyTypeLabel, translate)).toBe("—");
  });
});
