import { describe, it, expect } from "vitest";
import { withTenant, insertOrganization, insertPractitioner } from "../db.js";
import { GetPublicSpecialistsQuery } from "./organization.js";

// Query-level integration test — hits the real tenant DB via withTenant(),
// per CLAUDE.md's "No mock-only tests for the API server" rule. Needs a
// running Postgres with this tenant's migrations applied (pnpm start /
// docker compose). This is the public, unauthenticated read path for the
// "find a specialist" map — no session/TenantContext involved.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("GetPublicSpecialistsQuery", () => {
  it("only returns active organizations that have been geocoded", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();

      await insertOrganization(client, {
        name: `QA Active Geocoded Clinic ${suffix}`,
        status: "active",
        latitude: 52.23,
        longitude: 21.01,
      });
      await insertOrganization(client, {
        name: `QA Active Ungeocoded Clinic ${suffix}`,
        status: "active",
      });
      await insertOrganization(client, {
        name: `QA Pending Clinic ${suffix}`,
        status: "pending_approval",
        latitude: 52.23,
        longitude: 21.01,
      });

      const results = await GetPublicSpecialistsQuery(client, suffix);
      const names = results.map((r) => r.name);

      expect(names).toContain(`QA Active Geocoded Clinic ${suffix}`);
      expect(names).not.toContain(`QA Active Ungeocoded Clinic ${suffix}`);
      expect(names).not.toContain(`QA Pending Clinic ${suffix}`);
    });
  });

  it("matches an affiliated practitioner's name and surfaces their clinic", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();

      const org = await insertOrganization(client, {
        name: `QA Doctor Search Clinic ${suffix}`,
        status: "active",
        latitude: 19.4326,
        longitude: -99.1332,
      });
      await insertPractitioner(client, {
        first_name: "Zbigniew",
        last_name: `Testowski${suffix}`,
        organization_id: org.id,
        status: "active",
      });

      const results = await GetPublicSpecialistsQuery(client, `Testowski${suffix}`);

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe(org.id);
      expect(results[0]!.practitioners.some((p) => p.name.includes(`Testowski${suffix}`))).toBe(true);
    });
  });

  it("never lists an organization whose show_on_public_map flag is off (test clinics, NEO-79)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();

      await insertOrganization(client, {
        name: `QA Public Clinic ${suffix}`,
        status: "active",
        latitude: 19.4326,
        longitude: -99.1332,
      });
      await insertOrganization(client, {
        name: `QA Hidden Test Clinic ${suffix}`,
        status: "active",
        latitude: 19.4326,
        longitude: -99.1332,
        show_on_public_map: false,
      });

      const names = (await GetPublicSpecialistsQuery(client, suffix)).map((r) => r.name);
      expect(names).toContain(`QA Public Clinic ${suffix}`);
      expect(names).not.toContain(`QA Hidden Test Clinic ${suffix}`);

      // Also absent from the unfiltered list the website actually loads.
      const all = (await GetPublicSpecialistsQuery(client)).map((r) => r.name);
      expect(all).not.toContain(`QA Hidden Test Clinic ${suffix}`);
    });
  });

  it("matches a specialty by its translated label, not only by its code ('dentista' finds dentist, NEO-79)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();

      const dentistOrg = await insertOrganization(client, {
        name: `QA Label Dental ${suffix}`,
        status: "active",
        latitude: 19.4189,
        longitude: -99.1606,
        specialties: ["dentist"],
      });
      const entOrg = await insertOrganization(client, {
        name: `QA Label ENT ${suffix}`,
        status: "active",
        latitude: 19.4189,
        longitude: -99.1606,
        specialties: ["ent"],
      });

      // es label (platform.lookups) is the word a patient in Mexico types.
      const spanish = (await GetPublicSpecialistsQuery(client, "dentista")).map((r) => r.id);
      expect(spanish).toContain(dentistOrg.id);
      expect(spanish).not.toContain(entOrg.id);

      // pl label, case-insensitive.
      const polish = (await GetPublicSpecialistsQuery(client, "STOMATOLOG")).map((r) => r.id);
      expect(polish).toContain(dentistOrg.id);

      // The raw code still works; a partial label works too.
      expect((await GetPublicSpecialistsQuery(client, "dentist")).map((r) => r.id)).toContain(dentistOrg.id);
      expect((await GetPublicSpecialistsQuery(client, "otorrino")).map((r) => r.id)).toContain(entOrg.id);
    });
  });

  it("matches a practitioner's specialty label and surfaces their clinic", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();

      // The clinic itself carries no specialty; only its doctor does.
      const org = await insertOrganization(client, {
        name: `QA Practitioner Label Clinic ${suffix}`,
        status: "active",
        latitude: 19.4,
        longitude: -99.1,
      });
      const practitioner = await insertPractitioner(client, {
        first_name: "Ana",
        last_name: `Neumo${suffix}`,
        organization_id: org.id,
        status: "active",
      });
      // insertPractitioner only writes primary_specialty; the public query reads the specialties array.
      await client.query(`UPDATE practitioner SET specialties = ARRAY['pulmonologist'] WHERE id = $1`, [practitioner.id]);

      const ids = (await GetPublicSpecialistsQuery(client, "neumólogo")).map((r) => r.id);
      expect(ids).toContain(org.id);
    });
  });

  it("matches a tenant lookup override label as well as the global vocabulary", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();
      const code = `qaspec${suffix.replace(/[^a-z0-9]/gi, "")}`;

      const org = await insertOrganization(client, {
        name: `QA Override ${suffix}`,
        status: "active",
        latitude: 19.4,
        longitude: -99.1,
        specialties: [code],
      });
      await client.query(`INSERT INTO lookup (type, key, locale, value) VALUES ('specialty', $1, 'es', $2)`, [
        code,
        `Ortodoncista del sueño ${suffix}`,
      ]);

      const ids = (await GetPublicSpecialistsQuery(client, `ortodoncista del sueño ${suffix}`)).map((r) => r.id);
      expect(ids).toEqual([org.id]);
    });
  });
});
