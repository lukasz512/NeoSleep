import { describe, it, expect } from "vitest";
import { displayNameSql, formatDisplayName, formatOptionalDisplayName } from "./personName.js";

describe("formatDisplayName", () => {
  it.each(["Dr.", "Dra.", "Prof."])("keeps the academic title %s", (salutation) => {
    expect(formatDisplayName({ salutation, first_name: "Lorena", last_name: "Gonzalez" })).toBe(
      `${salutation} Lorena Gonzalez`
    );
  });

  it.each(["Lic.", "Mgr.", "Sr.", "Sra."])("drops the plain honorific %s", (salutation) => {
    expect(formatDisplayName({ salutation, first_name: "Lorena", last_name: "Gonzalez" })).toBe(
      "Lorena Gonzalez"
    );
  });

  it("handles a null salutation", () => {
    expect(formatDisplayName({ salutation: null, first_name: "Lorena", last_name: "Gonzalez" })).toBe(
      "Lorena Gonzalez"
    );
  });

  it("handles an unrecognized/unexpected salutation value the same as a plain honorific", () => {
    expect(formatDisplayName({ salutation: "Ing.", first_name: "Lorena", last_name: "Gonzalez" })).toBe(
      "Lorena Gonzalez"
    );
  });
});

describe("formatOptionalDisplayName", () => {
  it("returns null when there is no name at all — never a lone title", () => {
    expect(formatOptionalDisplayName({ salutation: "Dr.", first_name: null, last_name: null })).toBeNull();
    expect(formatOptionalDisplayName({ salutation: null, first_name: "  ", last_name: "" })).toBeNull();
  });

  it("applies the same allow-list as formatDisplayName", () => {
    expect(formatOptionalDisplayName({ salutation: "Dra.", first_name: "Ana", last_name: "López" })).toBe("Dra. Ana López");
    expect(formatOptionalDisplayName({ salutation: "Lic.", first_name: "Ana", last_name: "López" })).toBe("Ana López");
  });

  it("keeps a partial name (only one part present)", () => {
    expect(formatOptionalDisplayName({ salutation: "Dr.", first_name: null, last_name: "López" })).toBe("Dr. López");
    expect(formatOptionalDisplayName({ salutation: null, first_name: "Ana", last_name: null })).toBe("Ana");
  });
});

describe("displayNameSql", () => {
  it("builds the allow-list from the same set formatDisplayName uses", () => {
    expect(displayNameSql("di")).toContain("di.title IN ('Dr.', 'Dra.', 'Prof.')");
  });

  it("rejects anything that isn't a plain SQL identifier (fail loud, never interpolate)", () => {
    expect(() => displayNameSql("di; DROP TABLE x")).toThrow();
    expect(() => displayNameSql("")).toThrow();
  });
});
