import { describe, it, expect } from "vitest";
import {
  withTenant,
  insertPractitioner,
  insertOrganization,
  getGlobalTerritoryId,
  getOrganizationAffiliations,
  linkPractitionerOrganization,
  setGlobalPrimaryOrganization,
} from "../src/db.js";

/**
 * Real DB only, per CLAUDE.md — see migration 028's own file for why this
 * backfill exists (NEO-17 follow-up: existing practitioners with a legacy
 * organization_id showed a confusing empty "Clinics" panel with nothing
 * backfilled into practitioner_organization).
 *
 * Exercises the migration's INNER per-schema SQL directly (unqualified table
 * names, relying on withTenant's search_path) rather than the full file —
 * the file also loops `SELECT db_schema FROM platform.tenants`, and the
 * "test" schema this suite runs against is deliberately NOT registered
 * there (only "neosleep"/"fourseasons" are — verified against live data),
 * so running the file as-is against a withTenant("test", ...) client would
 * always no-op. The multi-tenant looping wrapper itself is the same proven
 * pattern as migration 026's own backfill, not new logic worth re-testing.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Same statement as inside migration 028's per-schema EXECUTE format(...) —
// keep these two in sync if the migration's INSERT ever changes.
const BACKFILL_SQL = `
  INSERT INTO practitioner_organization (practitioner_id, organization_id, is_primary)
  SELECT p.id, p.organization_id,
    NOT EXISTS (
      SELECT 1 FROM practitioner_organization po
      WHERE po.practitioner_id = p.id AND po.is_primary = true
    )
  FROM practitioner p
  WHERE p.organization_id IS NOT NULL
    AND p.deleted_at IS NULL
  ON CONFLICT (practitioner_id, organization_id) DO NOTHING`;

async function runBackfill(client: Parameters<typeof insertPractitioner>[0]): Promise<void> {
  await client.query(BACKFILL_SQL);
}

describe("Migration 028 — practitioner_organization backfill", () => {
  it("backfills a legacy organization_id as the practitioner's primary when no affiliation exists yet", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const org = await insertOrganization(client, { name: `QA Backfill Clinic ${uniqueSuffix()}` });
      const practitioner = await insertPractitioner(client, {
        first_name: "Backfill",
        last_name: `Legacy-${uniqueSuffix()}`,
        organization_id: org.id,
        territory_id: globalId,
      });

      expect(await getOrganizationAffiliations(client, practitioner.id)).toHaveLength(0);

      await runBackfill(client);

      const affiliations = await getOrganizationAffiliations(client, practitioner.id);
      expect(affiliations).toHaveLength(1);
      expect(affiliations[0]).toMatchObject({ organization_id: org.id, is_primary: true });
    });
  }, 15000);

  it("is idempotent — running it twice does not create a duplicate row", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const org = await insertOrganization(client, { name: `QA Backfill Idempotent ${uniqueSuffix()}` });
      const practitioner = await insertPractitioner(client, {
        first_name: "Idempotent",
        last_name: `Backfill-${uniqueSuffix()}`,
        organization_id: org.id,
      });

      await runBackfill(client);
      await runBackfill(client);

      expect(await getOrganizationAffiliations(client, practitioner.id)).toHaveLength(1);
    });
  }, 15000);

  it("does not overwrite an existing primary — backfills the legacy clinic as non-primary instead", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const legacyOrg = await insertOrganization(client, { name: `QA Backfill Legacy ${uniqueSuffix()}` });
      const realPrimaryOrg = await insertOrganization(client, { name: `QA Backfill RealPrimary ${uniqueSuffix()}` });
      const practitioner = await insertPractitioner(client, {
        first_name: "AlreadyPrimary",
        last_name: `Backfill-${uniqueSuffix()}`,
        organization_id: legacyOrg.id,
      });
      // Simulates the practitioner already having used the new feature
      // (linked + set a different clinic as primary) before this backfill runs.
      await linkPractitionerOrganization(client, practitioner.id, realPrimaryOrg.id, null);
      await setGlobalPrimaryOrganization(client, practitioner.id, realPrimaryOrg.id);

      await runBackfill(client);

      const affiliations = await getOrganizationAffiliations(client, practitioner.id);
      expect(affiliations).toHaveLength(2);
      const byOrg = Object.fromEntries(affiliations.map((a) => [a.organization_id, a]));
      expect(byOrg[realPrimaryOrg.id]!.is_primary).toBe(true);
      expect(byOrg[legacyOrg.id]!.is_primary).toBe(false);
    });
  }, 15000);

  it("does nothing for a practitioner with no legacy organization_id", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const practitioner = await insertPractitioner(client, {
        first_name: "NoLegacyClinic",
        last_name: `Backfill-${uniqueSuffix()}`,
      });

      await runBackfill(client);

      expect(await getOrganizationAffiliations(client, practitioner.id)).toHaveLength(0);
    });
  }, 15000);
});
