import { describe, it, expect } from "vitest";
import { shortPersonName } from "./shortPersonName";

describe("shortPersonName", () => {
  it("keeps the salutation, the first given name and the first surname", () => {
    expect(shortPersonName("Dra. Lorena Alejandra González Pimentel", "Lorena Alejandra", "González Pimentel")).toBe("Dra. Lorena González");
    expect(shortPersonName("Janneth Candelaria Urdaneta Aguirre", "Janneth Candelaria", "Urdaneta Aguirre")).toBe("Janneth Urdaneta");
  });

  it("leaves a two-word name as it is", () => {
    expect(shortPersonName("Dr. Andrzej Testerski", "Andrzej", "Testerski")).toBe("Dr. Andrzej Testerski");
  });

  it("falls back to the label when the name parts are missing", () => {
    expect(shortPersonName("Clínica Dental Polanco", null, null)).toBe("Clínica Dental Polanco");
    expect(shortPersonName(null, null, null)).toBe("");
  });
});
