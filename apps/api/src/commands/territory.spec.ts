import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getTerritoryPath } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreateTerritoryCommand, UpdateTerritoryCommand, DeleteTerritoryCommand } from "./territory.js";
import { ValidationError } from "../errors.js";

// Command-level integration test — hits the real tenant DB via withTenant(),
// per CLAUDE.md's "No mock-only tests for the API server" rule.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreateTerritoryCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-territory-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("CreateTerritoryCommand", () => {
  it("rejects an invalid kind", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        CreateTerritoryCommand(ctx, { name: `Bad-${uniqueSuffix()}`, country_code: "MX", kind: "planet" })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("rejects a parent_id that does not reference an existing territory", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        CreateTerritoryCommand(ctx, {
          name: `Orphan-${uniqueSuffix()}`,
          country_code: "MX",
          kind: "city",
          parent_id: "00000000-0000-0000-0000-000000000000",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("creates a root-level (country) territory", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const territory = await CreateTerritoryCommand(ctx, {
        name: "Mexico",
        code: `mx-${uniqueSuffix()}`,
        country_code: "MX",
        kind: "country",
      });
      expect(territory.kind).toBe("country");
      expect(territory.parent_id).toBeNull();
    });
  });

  it("creates a child territory under an existing parent", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const country = await CreateTerritoryCommand(ctx, {
        name: "Mexico",
        country_code: "MX",
        kind: "country",
      });
      const city = await CreateTerritoryCommand(ctx, {
        name: "CDMX",
        country_code: "MX",
        kind: "city",
        parent_id: country.id,
      });
      expect(city.parent_id).toBe(country.id);
    });
  });
});

describe("UpdateTerritoryCommand", () => {
  it("rejects a territory being set as its own parent", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const territory = await CreateTerritoryCommand(ctx, { name: `Self-${uniqueSuffix()}`, country_code: "MX", kind: "region" });
      await expect(UpdateTerritoryCommand(ctx, territory.id, { parent_id: territory.id })).rejects.toThrow(ValidationError);
    });
  });

  /**
   * Security-review finding (this session): the direct self-parent check
   * alone doesn't stop a cycle built over two separate edits (B's parent
   * becomes A, then A's parent becomes B) — and getTerritoryPath's recursive
   * CTE has no built-in cycle protection in Postgres, so an undetected cycle
   * would make it loop until statement_timeout. This is the regression test
   * for that fix: walk the full ancestor chain, not just the immediate id.
   */
  it("rejects an indirect cycle (A's parent becomes B, then B's parent becomes A)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const a = await CreateTerritoryCommand(ctx, { name: `CycleA-${uniqueSuffix()}`, country_code: "MX", kind: "region" });
      const b = await CreateTerritoryCommand(ctx, { name: `CycleB-${uniqueSuffix()}`, country_code: "MX", kind: "city", parent_id: a.id });

      await expect(UpdateTerritoryCommand(ctx, a.id, { parent_id: b.id })).rejects.toThrow(ValidationError);

      // The rejected update must not have partially applied.
      const path = await getTerritoryPath(client, b.id);
      expect(path.map((n) => n.id)).toEqual([a.id, b.id]);
    });
  });

  it("rejects an invalid kind on update", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const territory = await CreateTerritoryCommand(ctx, { name: `Kind-${uniqueSuffix()}`, country_code: "MX", kind: "region" });
      await expect(UpdateTerritoryCommand(ctx, territory.id, { kind: "planet" })).rejects.toThrow(ValidationError);
    });
  });

  it("updates name/code and re-parents onto a different, non-cyclic valid parent", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const parentA = await CreateTerritoryCommand(ctx, { name: `ParentA-${uniqueSuffix()}`, country_code: "MX", kind: "country" });
      const parentB = await CreateTerritoryCommand(ctx, { name: `ParentB-${uniqueSuffix()}`, country_code: "MX", kind: "country" });
      const child = await CreateTerritoryCommand(ctx, { name: "Original", country_code: "MX", kind: "region", parent_id: parentA.id });

      const updated = await UpdateTerritoryCommand(ctx, child.id, { name: "Renamed", parent_id: parentB.id });
      expect(updated?.name).toBe("Renamed");
      expect(updated?.parent_id).toBe(parentB.id);
    });
  });

  it("returns null for a territory id that doesn't exist", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const result = await UpdateTerritoryCommand(ctx, "00000000-0000-0000-0000-000000000000", { name: "X" });
      expect(result).toBeNull();
    });
  });
});

describe("DeleteTerritoryCommand (soft delete)", () => {
  it("soft-deletes the target node itself — getTerritoryPath called on a deleted id returns []", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const territory = await CreateTerritoryCommand(ctx, { name: `DelTarget-${uniqueSuffix()}`, country_code: "MX", kind: "region" });

      await DeleteTerritoryCommand(ctx, territory.id);

      // getTerritoryPath's base case requires deleted_at IS NULL for the
      // starting id — this is the documented fallback GetPatientByIdQuery
      // relies on ("fall back to the flat identities.region text" when a
      // patient's territory_id points at a since-deleted node).
      const path = await getTerritoryPath(client, territory.id);
      expect(path).toEqual([]);
    });
  });

  it("soft-deleting an ancestor truncates a descendant's path rather than including the deleted node", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const parent = await CreateTerritoryCommand(ctx, { name: `DelParent-${uniqueSuffix()}`, country_code: "MX", kind: "country" });
      const child = await CreateTerritoryCommand(ctx, { name: `DelChild-${uniqueSuffix()}`, country_code: "MX", kind: "city", parent_id: parent.id });

      await DeleteTerritoryCommand(ctx, parent.id);

      // The recursive CTE's join step also filters deleted_at IS NULL, so
      // once it can't cross the deleted parent it just stops — the child's
      // own (still-live) row was already captured by the base case, so the
      // path is [child], not [] and not [parent, child].
      const path = await getTerritoryPath(client, child.id);
      expect(path.map((n) => n.id)).toEqual([child.id]);
    });
  });
});
