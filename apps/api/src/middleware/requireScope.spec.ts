import { describe, it, expect } from "vitest";
import { getAllowedScopePaths, assertTerritoryAccess } from "./requireScope.js";
import { withTenant, getGlobalTerritoryId, getCountryTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { UserRoleScope } from "../db.js";
import { ForbiddenError } from "../errors.js";

// Real-DB integration test (per CLAUDE.md's "no mock PostgreSQL" rule) —
// getAllowedScopePaths/assertTerritoryAccess resolve territory_id -> ltree
// path via a real query, unlike the old string-comparison
// getAllowedCountryCodes/assertScopeAccess this replaces (migration 022).
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function makeCtx(client: TenantContext["client"], roles: UserRoleScope[]): TenantContext {
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: "u1", email: "qa@example.com", role: "admin", roles },
    requestId: "test-request-id",
  };
}

describe("getAllowedScopePaths", () => {
  it("returns null (unrestricted) when any role has the global root as its scope", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      expect(await getAllowedScopePaths(client, [{ role: "admin", territory_id: globalId }])).toBeNull();
    });
  });

  it("returns null when global is mixed with country-scoped roles", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const plId = await getCountryTerritoryId(client, "PL");
      expect(plId).not.toBeNull();
      expect(
        await getAllowedScopePaths(client, [
          { role: "rep", territory_id: plId! },
          { role: "admin", territory_id: globalId },
        ])
      ).toBeNull();
    });
  });

  it("returns the ltree paths of every distinct granted scope when none is global", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      expect(plId).not.toBeNull();
      expect(mxId).not.toBeNull();
      const paths = await getAllowedScopePaths(client, [
        { role: "rep", territory_id: plId! },
        { role: "kam", territory_id: mxId! },
      ]);
      expect(paths).toHaveLength(2);
    });
  });

  it("returns [] (matches nothing) for an empty roles array — fails secure, not open", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      expect(await getAllowedScopePaths(client, [])).toEqual([]);
    });
  });

  it("returns [] for undefined roles (stale pre-migration session) — fails secure, not open", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      expect(await getAllowedScopePaths(client, undefined)).toEqual([]);
    });
  });
});

describe("assertTerritoryAccess", () => {
  it("allows any record when the actor has a global-scoped role", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const ctx = makeCtx(client, [{ role: "admin", territory_id: globalId }]);
      await expect(assertTerritoryAccess(ctx, "MX")).resolves.not.toThrow();
      await expect(assertTerritoryAccess(ctx, null)).resolves.not.toThrow();
    });
  });

  it("allows a record whose country falls inside an allowed scope", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const ctx = makeCtx(client, [{ role: "rep", territory_id: plId! }]);
      await expect(assertTerritoryAccess(ctx, "PL")).resolves.not.toThrow();
    });
  });

  it("throws ForbiddenError for a record outside every allowed scope", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const ctx = makeCtx(client, [{ role: "rep", territory_id: plId! }]);
      await expect(assertTerritoryAccess(ctx, "MX")).rejects.toThrow(ForbiddenError);
    });
  });

  it("throws ForbiddenError when the record has no country_code and the actor isn't global", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const ctx = makeCtx(client, [{ role: "rep", territory_id: plId! }]);
      await expect(assertTerritoryAccess(ctx, null)).rejects.toThrow(ForbiddenError);
    });
  });

  it("throws ForbiddenError for every record when the actor has no roles (fail secure)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = makeCtx(client, []);
      await expect(assertTerritoryAccess(ctx, "PL")).rejects.toThrow(ForbiddenError);
    });
  });
});
