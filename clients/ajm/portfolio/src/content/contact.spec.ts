import { describe, expect, it } from "vitest";
import { CONTACT, telLink } from "./contact";
import { MORE_PROJECTS } from "./more";
import es from "../locales/es.json";
import en from "../locales/en.json";

describe("contact › the Spanish number (round 8, Łukasz 2026-09-29)", () => {
  it("is +34 674 039 138, dialable from any country", () => {
    expect(CONTACT.phoneEs).toBe("34674039138");
    expect(telLink(CONTACT.phoneEs)).toBe("tel:+34674039138");
  });
  it("is shown the Spanish way, and labelled in both languages", () => {
    expect(CONTACT.phoneEsDisplay).toBe("+34 674 03 91 38");
    expect(es.contact.phoneEs).toBeTruthy();
    expect(en.contact.phoneEs).toBeTruthy();
  });
});

describe("content › years of the extra projects (Y1: all 2023)", () => {
  it("Minions × Vogue Brasil and Indian Wedding are 2023", () => {
    for (const p of MORE_PROJECTS) expect(p.year).toBe(2023);
  });
  it("Beauty Week × Glamour is marked 2023 in both languages", () => {
    expect(es.privalia.chapters.beauty.mark).toBe("2023");
    expect(en.privalia.chapters.beauty.mark).toBe("2023");
  });
});
