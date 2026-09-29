import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import {
  withTenant,
  insertStaffUser,
  insertPractitioner,
  insertOrganization,
  insertPatient,
  linkPractitionerOrganization,
} from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * GET /api/v1/organization/:id/practitioners — HCO "Médicos" table (NEO-14,
 * docs/stories/hco-medicos-table.md). Real DB: verifies clinic membership
 * (primary organization_id OR practitioner_organization affiliation) and
 * every exclusion rule behind patient_count / device_count / efficiency_pct.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface StatsRow {
  id: string;
  name: string;
  patient_count: number;
  device_count: number;
  efficiency_pct: number | null;
}

let adminAuth = "";
let orgId = "";
let primaryDoctorId = "";
let affiliatedDoctorId = "";
let noPatientsDoctorId = "";
let outsiderDoctorId = "";

beforeAll(async () => {
  await withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-org-prac-admin-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const admin = await insertStaffUser(client, email, "QA", "OrgPrac", "admin", hash, false);
    adminAuth = `Bearer ${signAuthToken({ id: admin!.id, email, role: "admin", token_version: 0 })}`;

    const org = await insertOrganization(client, { name: `QA Medicos Clinic ${uniqueSuffix()}` });
    const otherOrg = await insertOrganization(client, { name: `QA Other Clinic ${uniqueSuffix()}` });
    orgId = org.id;

    // Primary workplace = this clinic (practitioner.organization_id)
    primaryDoctorId = (await insertPractitioner(client, {
      first_name: "Ana", last_name: `Primary-${uniqueSuffix()}`, organization_id: org.id,
    })).id;
    // Primary workplace elsewhere, affiliated here via practitioner_organization only
    affiliatedDoctorId = (await insertPractitioner(client, {
      first_name: "Beto", last_name: `Affiliated-${uniqueSuffix()}`, organization_id: otherOrg.id,
    })).id;
    await linkPractitionerOrganization(client, affiliatedDoctorId, org.id, null);
    noPatientsDoctorId = (await insertPractitioner(client, {
      first_name: "Carla", last_name: `NoPatients-${uniqueSuffix()}`, organization_id: org.id,
    })).id;
    // Not linked to this clinic in any way
    outsiderDoctorId = (await insertPractitioner(client, {
      first_name: "Dario", last_name: `Outsider-${uniqueSuffix()}`, organization_id: otherOrg.id,
    })).id;

    // primaryDoctor: 4 patients, 1 of them soft-deleted → patient_count 3
    const patientIds: string[] = [];
    for (let n = 0; n < 4; n++) {
      const pat = await insertPatient(client, { first_name: "Pac", last_name: `P${n}-${uniqueSuffix()}`, practitioner_id: primaryDoctorId });
      patientIds.push(pat.id);
    }
    await client.query(`UPDATE patient SET deleted_at = now() WHERE id = $1`, [patientIds[3]]);

    // primaryDoctor devices: only the first 2 count → device_count 2, efficiency round(2/3) = 67%
    const plan = (type: string, status: string, metadata: Record<string, unknown> | null, deleted: boolean) =>
      client.query(
        `INSERT INTO treatment_plan (patient_id, type, dentist_id, status, metadata, deleted_at)
         VALUES ($1, $2, $3, $4, $5, ${deleted ? "now()" : "NULL"})`,
        [patientIds[0], type, primaryDoctorId, status, metadata === null ? null : JSON.stringify(metadata)]
      );
    await plan("dental_appliance", "initiated", null, false);
    await plan("dental_appliance", "completed", {}, false);
    await plan("dental_appliance", "initiated", { orthoapneaDraft: { step: 1 } }, false); // draft
    await plan("dental_appliance", "cancelled", null, false);
    await plan("dental_appliance", "initiated", null, true); // soft-deleted
    await plan("cpap", "initiated", null, false); // not a DAN/MAD device

    // affiliatedDoctor: 1 patient, 2 devices → 200% (devices are attributed by dentist_id)
    const affPatient = await insertPatient(client, { first_name: "Pac", last_name: `Aff-${uniqueSuffix()}`, practitioner_id: affiliatedDoctorId });
    for (let n = 0; n < 2; n++) {
      await client.query(
        `INSERT INTO treatment_plan (patient_id, type, dentist_id, status) VALUES ($1, 'dental_appliance', $2, 'in_progress')`,
        [affPatient.id, affiliatedDoctorId]
      );
    }
  });
});

async function fetchList(query = ""): Promise<{ status: number; items: StatsRow[]; total: number }> {
  const res = await request(app)
    .get(`/api/v1/organization/${orgId}/practitioners${query}`)
    .set("Authorization", adminAuth);
  return { status: res.status, items: res.body.items ?? [], total: res.body.total ?? 0 };
}

describe("GET /api/v1/organization/:id/practitioners", () => {
  it("401s with no token", async () => {
    const res = await request(app).get(`/api/v1/organization/${crypto.randomUUID()}/practitioners`);
    expect(res.status).toBe(401);
  });

  it("lists doctors by primary organization_id AND by practitioner_organization affiliation, nobody else", async () => {
    const { status, items, total } = await fetchList();
    expect(status).toBe(200);
    const ids = items.map((i) => i.id).sort();
    expect(ids).toEqual([primaryDoctorId, affiliatedDoctorId, noPatientsDoctorId].sort());
    expect(total).toBe(3);
    expect(ids).not.toContain(outsiderDoctorId);
  });

  it("counts only non-deleted patients and only submitted, non-cancelled, non-deleted dental_appliance orders", async () => {
    const { items } = await fetchList();
    const primary = items.find((i) => i.id === primaryDoctorId)!;
    expect(primary.patient_count).toBe(3);
    expect(primary.device_count).toBe(2);
    expect(primary.efficiency_pct).toBe(67);
  });

  it("attributes devices by dentist_id, so efficiency can exceed 100%", async () => {
    const { items } = await fetchList();
    const affiliated = items.find((i) => i.id === affiliatedDoctorId)!;
    expect(affiliated.patient_count).toBe(1);
    expect(affiliated.device_count).toBe(2);
    expect(affiliated.efficiency_pct).toBe(200);
  });

  it("returns efficiency_pct null for a doctor with no patients", async () => {
    const { items } = await fetchList();
    const none = items.find((i) => i.id === noPatientsDoctorId)!;
    expect(none.patient_count).toBe(0);
    expect(none.device_count).toBe(0);
    expect(none.efficiency_pct).toBeNull();
  });

  it("sorts by efficiency_pct with nulls last", async () => {
    const desc = await fetchList("?sortBy=efficiency_pct&sortOrder=desc");
    expect(desc.items.map((i) => i.id)).toEqual([affiliatedDoctorId, primaryDoctorId, noPatientsDoctorId]);
    const asc = await fetchList("?sortBy=efficiency_pct&sortOrder=asc");
    expect(asc.items.map((i) => i.id)).toEqual([primaryDoctorId, affiliatedDoctorId, noPatientsDoctorId]);
  });

  it("sorts by name (last name) and by primary_specialty without a SQL error", async () => {
    const byName = await fetchList("?sortBy=name&sortOrder=asc");
    expect(byName.status).toBe(200);
    expect(byName.items.map((i) => i.id)).toEqual([affiliatedDoctorId, noPatientsDoctorId, primaryDoctorId]);
    const bySpecialty = await fetchList("?sortBy=primary_specialty&sortOrder=asc");
    expect(bySpecialty.status).toBe(200);
    expect(bySpecialty.total).toBe(3);
  });

  it("applies search within the clinic's doctors", async () => {
    const { items } = await fetchList("?search=affiliated");
    expect(items.map((i) => i.id)).toEqual([affiliatedDoctorId]);
  });
});

describe("GET /api/v1/practitioner?organization_id=", () => {
  it("also includes practitioner_organization affiliations (not only the primary organization_id)", async () => {
    const res = await request(app)
      .get(`/api/v1/practitioner?organization_id=${orgId}&limit=-1`)
      .set("Authorization", adminAuth);
    expect(res.status).toBe(200);
    const ids = (res.body.items as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(affiliatedDoctorId);
    expect(ids).not.toContain(outsiderDoctorId);
  });
});
