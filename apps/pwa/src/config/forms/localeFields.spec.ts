import { describe, it, expect, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../composables/useApi")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { languageForCountry, LANGUAGE_OPTIONS } from "./localeFields";
import { userFormDerive, userFormFields } from "./userForm";
import { loadScopeTerritoryOptions } from "./territoryOptions";

describe("languageForCountry (CORE-261)", () => {
  it("maps PL to pl, MX to mx and anything else to en", () => {
    expect(languageForCountry("PL")).toBe("pl");
    expect(languageForCountry("mx")).toBe("mx");
    expect(languageForCountry("TH")).toBe("en");
    expect(languageForCountry(null)).toBe("en");
  });

  it("offers exactly the languages the API can write mail in", () => {
    expect(LANGUAGE_OPTIONS.map((o) => o.value)).toEqual(["en", "pl", "mx"]);
  });
});

describe("userFormDerive (CORE-261)", () => {
  async function loadTerritories() {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: "t-mx", name: "Mexico", code: "MX", kind: "country", country_code: "MX" },
          { id: "t-pl", name: "Poland", code: "PL", kind: "country", country_code: "PL" },
          { id: "t-all", name: "Everywhere", code: null, kind: "global", country_code: "PL" },
        ],
      }),
    });
    await loadScopeTerritoryOptions();
  }

  it("fills region and language when the territory changes", async () => {
    await loadTerritories();
    expect(userFormDerive({ territory_id: "t-mx" }, { territory_id: null })).toEqual({ region: "MX", language: "mx" });
    expect(userFormDerive({ territory_id: "t-pl" }, { territory_id: "t-mx" })).toEqual({ region: "PL", language: "pl" });
  });

  it("leaves a stored user alone when the form just opened or the territory is unchanged", async () => {
    await loadTerritories();
    expect(userFormDerive({ territory_id: "t-mx" }, {})).toBeUndefined();
    expect(userFormDerive({ territory_id: "t-mx", language: "en" }, { territory_id: "t-mx" })).toBeUndefined();
  });

  it("does not set a country from a global territory", async () => {
    await loadTerritories();
    expect(userFormDerive({ territory_id: "t-all" }, { territory_id: null })).toBeUndefined();
  });

  it("has one territory field, a hidden region and a visible language", () => {
    expect(userFormFields.filter((f) => f.key === "territory_id")).toHaveLength(1);
    const region = userFormFields.find((f) => f.key === "region")!;
    expect(typeof region.hidden === "function" ? region.hidden({}) : region.hidden).toBe(true);
    expect(userFormFields.find((f) => f.key === "language")?.type).toBe("select");
  });
});
