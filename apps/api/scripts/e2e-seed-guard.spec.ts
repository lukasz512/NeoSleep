import { describe, expect, it } from "vitest";
import { assertLocalDatabase, requireE2EPassword } from "./e2e-seed-guard.js";

describe("assertLocalDatabase", () => {
  it.each([
    "postgresql://postgres:postgres@localhost:5432/postgres",
    "postgresql://u:p@127.0.0.1:5433/neo_test",
    "postgresql://u:p@[::1]:5432/db",
    "postgresql://u:p@postgres:5432/db",
  ])("allows local %s", (url) => {
    expect(() => assertLocalDatabase(url)).not.toThrow();
  });

  it("refuses the Supabase pooler (production)", () => {
    expect(() =>
      assertLocalDatabase("postgresql://u:p@aws-1-us-west-1.pooler.supabase.com:5432/postgres"),
    ).toThrow(/non-local database/);
  });

  it("refuses a missing DATABASE_URL", () => {
    expect(() => assertLocalDatabase(undefined)).toThrow(/not set/);
  });
});

describe("requireE2EPassword", () => {
  it("refuses a missing or short password", () => {
    expect(() => requireE2EPassword(undefined)).toThrow();
    expect(() => requireE2EPassword("short")).toThrow();
  });

  it("returns a long enough password", () => {
    expect(requireE2EPassword("x".repeat(24))).toBe("x".repeat(24));
  });
});
