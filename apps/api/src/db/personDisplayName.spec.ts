import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import {
  withTenant,
  insertStaffUser,
  getGlobalTerritoryId,
  insertPractitioner,
  insertOrganization,
  insertAuditLog,
  getAuditLogForEntities,
  getUserById,
  getSleepStudyById,
  getTreatmentPlanById,
} from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePatientCommand } from "../commands/patient.js";
import { CreateSleepStudyCommand, UpdateSleepStudyCommand } from "../commands/sleepStudy.js";
import { CreateTreatmentPlanCommand } from "../commands/treatmentPlan.js";
import { CreateNoteCommand } from "../commands/note.js";
import { GetPublicSpecialistsQuery } from "../queries/organization.js";
import { displayNameSql, formatDisplayName } from "../utils/personName.js";

// Integration test (real tenant DB via withTenant(), per CLAUDE.md's "No
// mock-only tests for the API server") for NEO-13: every DTO that carries a
// JOINed *related* person's display name (a treatment plan's doctor, a sleep
// study's interpreter, a note's author, an audit entry's user, a staff user's
// own `name`, a public clinic's practitioner list) must follow the same
// salutation rule as that person's own list row — utils/personName.ts. Before
// NEO-13 these concatenated first/last name by hand, so "Dra. Ana López" on
// the HCP list showed up as plain "Ana López" in the Tratamientos table.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: PoolClient): Promise<TenantContext> {
  const email = `qa-display-name-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

/** Staff users are created without a title (insertStaffUser has no such param) — set it directly on their identity. */
async function setUserTitle(client: PoolClient, userId: string, title: string | null): Promise<void> {
  await client.query(`UPDATE identities SET title = $1 WHERE id = (SELECT identity_id FROM users WHERE id = $2)`, [title, userId]);
}

async function createPatientWithStudy(ctx: TenantContext, salutation?: string) {
  const patient = await CreatePatientCommand(ctx, {
    gender: "female",
    date_of_birth: "1980-01-01",
    salutation,
    first_name: "Lucia",
    last_name: `Paciente-${uniqueSuffix()}`,
    email: `qa-patient-${uniqueSuffix()}@example.com`,
    phone: "600100200",
  });
  const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
  return { patient, study };
}

describe("displayNameSql — SQL twin of formatDisplayName", () => {
  it("produces exactly what formatDisplayName produces, for every salutation class", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const cases: Array<{ title: string | null; first_name: string; last_name: string }> = [
        { title: "Dr.", first_name: "Ana", last_name: "López" },
        { title: "Dra.", first_name: "Lorena Alejandra", last_name: "González Pimentel" },
        { title: "Prof.", first_name: "Jan", last_name: "Kowalski" },
        { title: "Lic.", first_name: "Marta", last_name: "Ruiz" },
        { title: "Sra.", first_name: "Elena", last_name: "Mora" },
        { title: null, first_name: "Tomasz", last_name: "Nowak" },
        { title: "Dr.", first_name: "", last_name: "Solo" },
      ];
      const values = cases.map((_, i) => `($${i * 3 + 1}::text, $${i * 3 + 2}::text, $${i * 3 + 3}::text, ${i})`).join(", ");
      const result = await client.query<{ name: string; idx: number }>(
        `SELECT ${displayNameSql("p")} AS name, idx FROM (VALUES ${values}) AS p(title, first_name, last_name, idx) ORDER BY idx`,
        cases.flatMap((c) => [c.title, c.first_name, c.last_name])
      );

      expect(result.rows.map((r) => r.name)).toEqual(
        cases.map((c) => formatDisplayName({ salutation: c.title, first_name: c.first_name, last_name: c.last_name }))
      );
    });
  });
});

describe("treatment plan — doctor (dentist_name) and patient_name", () => {
  it("shows an academic title on the plan's doctor (the NEO-13 bug)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { patient, study } = await createPatientWithStudy(ctx);
      const doctor = await insertPractitioner(client, { salutation: "Dra.", first_name: "Ana", last_name: `Lopez-${uniqueSuffix()}` });

      const plan = await CreateTreatmentPlanCommand(ctx, {
        patient_id: patient.id,
        sleep_study_id: study.id,
        type: "dental_appliance",
        dentist_id: doctor.id,
      });
      const reloaded = await getTreatmentPlanById(client, plan.id);

      expect(reloaded!.dentist_name).toBe(`Dra. Ana ${doctor.last_name}`);
    });
  });

  it("drops a plain honorific (Lic.) — same allow-list as the HCP list", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { patient, study } = await createPatientWithStudy(ctx);
      const doctor = await insertPractitioner(client, { salutation: "Lic.", first_name: "Marta", last_name: `Ruiz-${uniqueSuffix()}` });

      const plan = await CreateTreatmentPlanCommand(ctx, {
        patient_id: patient.id,
        sleep_study_id: study.id,
        type: "dental_appliance",
        dentist_id: doctor.id,
      });

      expect((await getTreatmentPlanById(client, plan.id))!.dentist_name).toBe(`Marta ${doctor.last_name}`);
    });
  });

  it("returns null (not an empty string or a lone title) when no doctor is assigned", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { patient, study } = await createPatientWithStudy(ctx);

      const plan = await CreateTreatmentPlanCommand(ctx, { patient_id: patient.id, sleep_study_id: study.id, type: "cpap" });

      expect((await getTreatmentPlanById(client, plan.id))!.dentist_name).toBeNull();
    });
  });

  it("applies the same rule to the patient's own name", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { patient, study } = await createPatientWithStudy(ctx, "Prof.");

      const plan = await CreateTreatmentPlanCommand(ctx, { patient_id: patient.id, sleep_study_id: study.id, type: "cpap" });

      expect((await getTreatmentPlanById(client, plan.id))!.patient_name).toBe(`Prof. Lucia ${patient.last_name}`);
    });
  });
});

describe("sleep study — interpreted_by_name and patient_name", () => {
  it("shows the interpreting doctor's title, and a plain name for a patient without one", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { patient, study } = await createPatientWithStudy(ctx);
      const doctor = await insertPractitioner(client, { salutation: "Dr.", first_name: "Jorge", last_name: `Mena-${uniqueSuffix()}` });

      await UpdateSleepStudyCommand(ctx, study.id, { interpreted_by: doctor.id });
      const reloaded = await getSleepStudyById(client, study.id);

      expect(reloaded!.interpreted_by_name).toBe(`Dr. Jorge ${doctor.last_name}`);
      expect(reloaded!.patient_name).toBe(`Lucia ${patient.last_name}`);
    });
  });
});

describe("staff-user-derived names — note author, audit entry user, users.name", () => {
  it("note author_name carries the author's academic title", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await setUserTitle(client, ctx.user.id, "Dr.");
      const { patient } = await createPatientWithStudy(ctx);

      const note = await CreateNoteCommand(ctx, { entity_type: "patient", entity_id: patient.id, body: "Follow-up call." });

      expect(note.author_name).toBe("Dr. QA Pilot");
    });
  });

  it("audit log user_name carries the acting user's academic title", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await setUserTitle(client, ctx.user.id, "Dra.");
      const { patient } = await createPatientWithStudy(ctx);
      await insertAuditLog(client, { user_id: ctx.user.id, action: "update", entity_type: "Patient", entity_id: patient.id, outcome: "success" });

      const entries = await getAuditLogForEntities(client, ["Patient"], [patient.id]);
      const mine = entries.filter((e) => e.user_id === ctx.user.id);

      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((e) => e.user_name === "Dra. QA Pilot")).toBe(true);
    });
  });

  it("users.name follows the rule: title shown for Prof., hidden for Sr.", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);

      await setUserTitle(client, ctx.user.id, "Prof.");
      expect((await getUserById(client, ctx.user.id))!.name).toBe("Prof. QA Pilot");

      await setUserTitle(client, ctx.user.id, "Sr.");
      expect((await getUserById(client, ctx.user.id))!.name).toBe("QA Pilot");
    });
  });
});

describe("public specialists — practitioner names on the website map", () => {
  it("lists a clinic's doctor with their academic title", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();
      const org = await insertOrganization(client, {
        name: `QA Title Clinic ${suffix}`,
        status: "active",
        latitude: 19.4326,
        longitude: -99.1332,
      });
      await insertPractitioner(client, {
        salutation: "Dra.",
        first_name: "Laura",
        last_name: `Cuicas${suffix}`,
        organization_id: org.id,
        status: "active",
      });

      const results = await GetPublicSpecialistsQuery(client, `Cuicas${suffix}`);

      expect(results).toHaveLength(1);
      expect(results[0]!.practitioners.map((p) => p.name)).toEqual([`Dra. Laura Cuicas${suffix}`]);
    });
  });
});
