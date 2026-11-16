import { describe, expect, it } from "vitest";
import { ROLES, SECTIONS, isPersonalLink, lensFrom, lensQuery, sectionOrder } from "./lens";

describe("neocrm lens › who is reading (CORE-215)", () => {
  it("reads the role and the sector from the link", () => {
    expect(lensFrom("?para=talleres-rivas&rol=it&sector=comercios")).toEqual({ role: "it", sector: "comercios" });
    expect(lensFrom("?rol=Direccion")).toEqual({ role: "direccion", sector: null });
  });
  it("English links work too", () => {
    expect(lensFrom("?role=operations&sector=shops")).toEqual({ role: "operaciones", sector: "comercios" });
    expect(lensFrom("?sector=services")).toEqual({ role: null, sector: "servicios" });
  });
  it("anything unknown means the normal page", () => {
    expect(lensFrom("")).toEqual({ role: null, sector: null });
    expect(lensFrom("?rol=ceo&sector=%3Cscript%3E")).toEqual({ role: null, sector: null });
    // the clinics sector is gone: an old link opens the general page
    expect(lensFrom("?sector=clinicas")).toEqual({ role: null, sector: null });
  });
});

describe("neocrm lens › the role reorders sections, it never hides one", () => {
  it.each(ROLES)("%s sees every section exactly once", (role) => {
    expect([...sectionOrder(role)].sort()).toEqual([...SECTIONS].sort());
  });
  it("each role starts with its own question", () => {
    expect(sectionOrder("it")[0]).toBe("security");
    expect(sectionOrder("direccion")[0]).toBe("who");
    expect(sectionOrder("operaciones")[0]).toBe("product");
  });
  it("no role means the normal order", () => {
    expect(sectionOrder(null)).toEqual(SECTIONS);
  });
});

describe("neocrm lens › switching on the page keeps the rest of the link", () => {
  it("keeps the greeting and the language", () => {
    expect(lensQuery("?para=talleres-rivas&lang=en", { role: "it", sector: null })).toBe("?para=talleres-rivas&lang=en&rol=it");
  });
  it("replaces the old role, English spelling included", () => {
    expect(lensQuery("?role=management&sector=equipos", { role: "operaciones", sector: "equipos" })).toBe("?sector=equipos&rol=operaciones");
  });
  it("clearing the lens leaves a clean link", () => {
    expect(lensQuery("?rol=it", { role: null, sector: null })).toBe("");
  });
});

describe("neocrm lens › personal links stay out of search engines", () => {
  it("any personal parameter marks the link", () => {
    expect(isPersonalLink("?para=talleres-rivas")).toBe(true);
    expect(isPersonalLink("?rol=it")).toBe(true);
    expect(isPersonalLink("?lang=en")).toBe(false);
    expect(isPersonalLink("")).toBe(false);
  });
});
