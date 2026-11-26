import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { listCountKey } from "./listCountLabel";

const load = (lang: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../../../../packages/i18n/${lang}.json`), "utf-8")) as Record<string, string>;

// NEO-152: the record count under a list's title.
describe("listCountKey", () => {
  it("picks Polish one / few / many forms", () => {
    expect(listCountKey(1, "pl")).toBe("app.list.count.one");
    expect(listCountKey(3, "pl")).toBe("app.list.count.few");
    expect(listCountKey(5, "pl")).toBe("app.list.count.many");
    expect(listCountKey(22, "pl")).toBe("app.list.count.few");
    expect(listCountKey(128, "pl")).toBe("app.list.count.many");
  });

  it("uses one / other for English and Mexican Spanish (mx → es-MX)", () => {
    expect(listCountKey(1, "en")).toBe("app.list.count.one");
    expect(listCountKey(8, "en")).toBe("app.list.count.other");
    expect(listCountKey(1, "mx")).toBe("app.list.count.one");
    expect(listCountKey(8, "mx")).toBe("app.list.count.other");
  });

  it("every key it can return exists in every language, with the count in it", () => {
    for (const lang of ["en", "pl", "mx"]) {
      const messages = load(lang);
      for (const category of ["one", "few", "many", "other"]) {
        expect(messages[`app.list.count.${category}`], `${lang} ${category}`).toContain("{count}");
      }
    }
    expect(load("pl")["app.list.count.many"]).toBe("{count} rekordów");
  });

  it("lists name what they count, in every language and plural form", () => {
    const nouns = ["patients", "doctors", "clinics", "leads", "users", "territories", "studies", "devices"] as const;
    for (const noun of nouns) {
      expect(listCountKey(1, "en", noun)).toBe(`app.list.count.${noun}.one`);
      expect(listCountKey(5, "pl", noun)).toBe(`app.list.count.${noun}.many`);
      for (const lang of ["en", "pl", "mx"]) {
        const messages = load(lang);
        for (const category of ["one", "few", "many", "other"]) {
          expect(messages[`app.list.count.${noun}.${category}`], `${lang} ${noun} ${category}`).toContain("{count}");
        }
        expect(messages["app.list.filtered"], lang).toBeTruthy();
      }
    }
    expect(load("pl")["app.list.count.patients.few"]).toBe("{count} pacjentów");
    expect(load("pl")["app.list.count.studies.many"]).toBe("{count} badań");
    expect(load("en")["app.list.count.patients.other"]).toBe("{count} patients");
  });

  it("every list view names its count", () => {
    for (const view of ["PatientsView", "HCPView", "HCOView", "LeadsView", "UsersView", "TerritoriesView", "SleepStudiesView", "TreatmentPlansView"]) {
      const src = readFileSync(path.resolve(__dirname, `../views/${view}.vue`), "utf-8");
      expect(src, view).toMatch(/countNoun: "[a-z]+" as const,/);
    }
  });
});
