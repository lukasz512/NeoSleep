import { describe, it, expect } from "vitest";
import { formatDisplayName } from "./personName.js";

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
