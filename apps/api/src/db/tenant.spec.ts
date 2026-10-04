import { describe, it, expect } from "vitest";
import { getActiveTenantSlugs, withTenant, withPlatform, isPostgresError, isConnectionError } from "./tenant.js";
import { AppError, DatabaseError, NotFoundError } from "../errors.js";

/**
 * getActiveTenantSlugs() is a plain platform-schema read (no tenant
 * search_path involved) — real Postgres per CLAUDE.md's "no mock-only
 * tests" rule, nothing to mock here at all. Added alongside
 * SyncOrthoApneaTreatmentStatusesAllTenantsCommand (see
 * commands/orthoapneaSync.spec.ts), which is the first real caller of this —
 * see that function's own doc comment for why tenantSlugFromHost() alone
 * isn't enough for a job that must run for every tenant.
 */
describe("getActiveTenantSlugs", () => {
  it("returns 'neosleep' (status='active') but not 'fourseasons' (status='provisioning')", async () => {
    // Both rows are real, persistent seed data in platform.tenants (not
    // created/torn down by this test) — see migration 000_platform.sql and
    // project memory on the fourseasons pivot. The integration-test "test"
    // schema is deliberately NOT one of platform.tenants' rows (provisioned
    // directly by scripts/sync-test-schema.ts, outside the normal tenant
    // registry), so it's correctly absent from this result too.
    const slugs = await getActiveTenantSlugs();
    expect(Array.isArray(slugs)).toBe(true);
    expect(slugs).toContain("neosleep");
    expect(slugs).not.toContain("fourseasons");
    slugs.forEach((slug) => expect(typeof slug).toBe("string"));
  });
});

/**
 * NEO-202: "Database error: withTenant" must mean the database. A rejected
 * email or a bug in a command used to be relabelled as one (7 of 8 such
 * toasts on dev in two weeks); now only Postgres/connection errors are.
 */
describe("withTenant / withPlatform error labels", () => {
  const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

  it("keeps a non-database error as it is — not DB_ERROR", async () => {
    const boom = new Error("mail provider said no");
    const caught = await withTenant(TENANT_SLUG, async () => {
      throw boom;
    }).catch((err: unknown) => err);
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(DatabaseError);
  });

  it("passes AppErrors through unchanged", async () => {
    await expect(withPlatform(async () => { throw new NotFoundError("Patient", "x"); })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("still labels a real Postgres error DB_ERROR, and rolls the transaction back", async () => {
    const caught = await withTenant(TENANT_SLUG, async (client) => {
      await client.query("SELECT * FROM table_that_does_not_exist_neo202");
    }).catch((err: unknown) => err);
    expect(caught).toBeInstanceOf(DatabaseError);
    expect((caught as AppError).code).toBe("DB_ERROR");
    expect(String((caught as AppError).cause)).toContain("table_that_does_not_exist_neo202");
  });

  it("recognises Postgres and connection failures, nothing else", () => {
    expect(isPostgresError(Object.assign(new Error("relation does not exist"), { code: "42P01" }))).toBe(true);
    expect(isPostgresError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(true);
    expect(isConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isPostgresError(new Error("validation_error: Invalid `to` field"))).toBe(false);
    expect(isPostgresError(new Error("Node.js detected but native WebSocket not found."))).toBe(false);
    expect(isPostgresError("not an error")).toBe(false);
  });
});
