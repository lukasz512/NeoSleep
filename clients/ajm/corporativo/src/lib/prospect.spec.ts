import { describe, expect, it } from "vitest";
import { prospectFrom } from "./prospect";

describe("prospect › personal pitch links (CORE-59)", () => {
  it("a known client gets its name and logo: ?para=mendel", () => {
    expect(prospectFrom("?para=mendel")).toEqual({ name: "Mendel", logo: "logos/mendel.png", height: 1 });
    expect(prospectFrom("?para=grupo-planeta")?.logo).toBe("logos/planeta.png");
  });
  it("any other name is greeted as written, without a logo", () => {
    expect(prospectFrom("?para=BBVA")).toEqual({ name: "BBVA" });
    expect(prospectFrom("?para=coca-cola")).toEqual({ name: "Coca Cola" });
    expect(prospectFrom("?para=el%20palacio%20de%20hierro")).toEqual({ name: "El Palacio De Hierro" });
  });
  it("English links work too: ?for=", () => {
    expect(prospectFrom("?for=privalia")?.name).toBe("Privalia");
  });
  it("no name, or nothing usable, means the normal page", () => {
    expect(prospectFrom("")).toBeNull();
    expect(prospectFrom("?src=qr")).toBeNull();
    expect(prospectFrom("?para=")).toBeNull();
    expect(prospectFrom("?para=%3Cscript%3E")).toEqual({ name: "Script" });
    expect(prospectFrom("?para=%3C%3E")).toBeNull();
  });
  it("a name is never longer than 32 characters", () => {
    expect(prospectFrom(`?para=${"a".repeat(80)}`)!.name.length).toBeLessThanOrEqual(32);
  });
});
