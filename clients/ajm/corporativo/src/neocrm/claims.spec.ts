import { describe, expect, it } from "vitest";
import { flattenCopy, forbiddenClaims } from "./claims";
import { ROLES, SECTIONS, SECTORS } from "./lens";
import es from "./locales/es.json";
import en from "./locales/en.json";

describe("neocrm copy › no claim the product can't back today (CORE-215)", () => {
  it.each([
    ["es", es],
    ["en", en],
  ])("%s copy contains no forbidden claim outside the roadmap", (_name, copy) => {
    expect(forbiddenClaims(copy)).toEqual([]);
  });
  it("catches a claim wherever it is written", () => {
    expect(forbiddenClaims({ hero: { body: "Datos alojados en la UE" }, faq: ["ISO 27001 certified"] })).toEqual(["hero.body", "faq.0"]);
  });
  it("the roadmap may name future work", () => {
    expect(forbiddenClaims({ sections: { roadmap: { items: [{ title: "ISO 27001" }] } } })).toEqual([]);
  });
  it("says where the data is hosted today", () => {
    expect(JSON.stringify(es)).toMatch(/Estados Unidos/);
    expect(JSON.stringify(en)).toMatch(/United States/);
  });
});

describe("neocrm copy › a general page for any company", () => {
  const MEDICAL = /cl[ií]nic|sanitari|salud|health|m[eé]dic|paciente|patient|laborator|pharma|farmac/i;
  // Łukasz 2026-11-16: the page never says how big the customer is
  const SIZE = /peque[ñn]|median[ao]s?\b|pymes?\b|\bsmall\b|mid-sized|medium-sized|\bSMEs?\b|pocas personas|few people/i;
  it.each([
    ["es", es],
    ["en", en],
  ])("%s copy never names a company size", (_name, copy) => {
    expect(flattenCopy(copy).filter(([, text]) => SIZE.test(text)).map(([path]) => path)).toEqual([]);
  });
  it.each([
    ["es", es],
    ["en", en],
  ])("%s copy has no medical wording anywhere", (_name, copy) => {
    // Łukasz 2026-11-16: a general-purpose CRM, no clinics sector and nothing that reads as medical
    expect(flattenCopy(copy).filter(([, text]) => MEDICAL.test(text)).map(([path]) => path)).toEqual([]);
    expect(SECTORS.some((sector) => MEDICAL.test(sector))).toBe(false);
  });
  it("the headline is about growing the business", () => {
    expect(es.hero.titles.default).toMatch(/crecer/);
    expect(en.hero.titles.default).toMatch(/grow/);
  });
  it.each([
    ["es", es, /calendario/i, /notificaciones|avisos/i],
    ["en", en, /calendar/i, /notifications/i],
  ])("%s copy leads with the everyday CRM: calendar and notifications", (_name, copy, calendar, notifications) => {
    expect(copy.hero.body).toMatch(calendar);
    expect(copy.hero.body).toMatch(notifications);
    const titles = copy.sections.product.items.map((item) => item.title).join(" · ");
    expect(titles).toMatch(calendar);
    expect(titles).toMatch(notifications);
  });
});

describe("neocrm copy › both languages carry the same keys", () => {
  it("es and en match key for key", () => {
    const keys = (copy: typeof es) => flattenCopy(copy).map(([path]) => path);
    expect(keys(en)).toEqual(keys(es));
  });
  it("every section, role and sector has its copy", () => {
    for (const id of SECTIONS) expect(es.sections[id].title).toBeTruthy();
    for (const role of ROLES) expect(es.lens.roles[role]).toBeTruthy();
    for (const sector of SECTORS) {
      expect(es.hero.titles[sector]).toBeTruthy();
      expect(es.sections.who.items[sector].title).toBeTruthy();
    }
  });
});
