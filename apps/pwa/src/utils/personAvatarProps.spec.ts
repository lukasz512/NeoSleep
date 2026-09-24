import { describe, it, expect } from "vitest";
import { personAvatarProps } from "./personAvatarProps";

describe("personAvatarProps", () => {
  it("maps an API row's snake_case name fields onto AppAvatar's props", () => {
    expect(personAvatarProps({ name: "Dra. Ana López", first_name: "Ana", last_name: "López" })).toEqual({
      name: "Dra. Ana López",
      firstName: "Ana",
      lastName: "López",
    });
  });

  it("normalizes missing fields to null (AppAvatar then falls back to name-based initials, then the icon)", () => {
    expect(personAvatarProps({})).toEqual({ name: null, firstName: null, lastName: null });
    expect(personAvatarProps({ name: "Ana López", first_name: undefined, last_name: null })).toEqual({
      name: "Ana López",
      firstName: null,
      lastName: null,
    });
  });
});
