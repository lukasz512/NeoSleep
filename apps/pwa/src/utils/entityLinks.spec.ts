import { describe, it, expect } from "vitest";
import { userDetailLink, hcoListLink } from "./entityLinks";

describe("userDetailLink", () => {
  it("returns null when there's no user id (e.g. a deleted/unlinked author)", () => {
    expect(userDetailLink("admin", null)).toBeNull();
    expect(userDetailLink("admin", undefined)).toBeNull();
  });

  it.each(["admin", "manager"] as const)("links to user-detail for role %s", (role) => {
    expect(userDetailLink(role, "user-1")).toEqual({ name: "user-detail", params: { id: "user-1" } });
  });

  it.each(["rep", "doctor", undefined, null] as const)(
    "returns null (plain text, no link) for role %s — /users/:id is admin/manager-only",
    (role) => {
      expect(userDetailLink(role, "user-1")).toBeNull();
    }
  );
});

describe("hcoListLink", () => {
  it("builds a /hco list link filtered by institution name — leads have no organization_id FK to link a detail page by id", () => {
    expect(hcoListLink("Clínica Ejemplo")).toEqual({ path: "/hco", query: { institution: "Clínica Ejemplo" } });
  });
});
