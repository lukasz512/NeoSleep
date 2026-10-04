import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../../server.js";
import {
  withTenant,
  insertStaffUser,
  insertPatient,
  insertPractitioner,
  insertSleepStudy,
  insertTreatmentPlan,
} from "../../db.js";
import { ensurePendingPartnerLink, markPartnerLinkSynced } from "../../db/partnerLink.js";
import { signAuthToken } from "../../utils/jwt.js";
import type { StaffRole } from "../../db/users.js";

/**
 * NEO-199: only admin / doctor / manager may push anything to OrthoApnea.
 * The order itself (POST /device-orders) is covered in test/device-orders;
 * this covers the two other routes that reach the partner: /ensure (creates
 * the OA patient with the patient's PII) and a comment with notifyOrthoApnea
 * (emails OA's team). Real Postgres; the partner boundary (global fetch) is
 * stubbed and must never be called for a denied role.
 */
vi.setConfig({ testTimeout: 30_000 });

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function staff(role: StaffRole, practitionerEmail?: string): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = practitionerEmail ?? `qa-neo199-${role}-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Roles", role, hash, false);
    return `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`;
  });
}

interface Fixture { patientId: string; planId: string }

/** A patient of `practitionerId` whose OA patient and order already exist, so allowed calls need no partner HTTP. */
async function syncedPatient(practitionerId: string): Promise<Fixture> {
  return withTenant(TENANT_SLUG, async (client) => {
    const p = await insertPatient(client, { first_name: "Roles", last_name: `Patient-${uniqueSuffix()}`, practitioner_id: practitionerId });
    const study = await insertSleepStudy(client, { patient_id: p.id });
    const plan = await insertTreatmentPlan(client, { patient_id: p.id, sleep_study_id: study.id, type: "dental_appliance" });
    const patientLink = await ensurePendingPartnerLink(client, "orthoapnea", "patient", p.id);
    await markPartnerLinkSynced(client, patientLink.id, `oa-pat-${uniqueSuffix()}`, null);
    return { patientId: p.id, planId: plan.id };
  });
}

let doctorAuth: string;
let fixture: Fixture;
const fetchSpy = vi.fn(() => Promise.reject(new Error("OrthoApnea must not be called")));

beforeAll(async () => {
  const email = `qa-neo199-doc-${uniqueSuffix()}@neosleepcare.com`;
  const practitioner = await withTenant(TENANT_SLUG, (client) =>
    insertPractitioner(client, { first_name: "Doc", last_name: `Roles-${uniqueSuffix()}`, email })
  );
  doctorAuth = await staff("doctor", email);
  fixture = await syncedPatient(practitioner.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

describe("NEO-199 POST /partners/orthoapnea/patients/:id/ensure", () => {
  it.each(["rep", "kam", "msl"] as const)("403 for %s and OrthoApnea receives nothing", async (role) => {
    vi.stubGlobal("fetch", fetchSpy);
    const res = await request(app)
      .post(`/api/v1/partners/orthoapnea/patients/${fixture.patientId}/ensure`)
      .set("Authorization", await staff(role))
      .send({});
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("admin, manager and the patient's doctor still get the OA patient id", async () => {
    for (const auth of [await staff("admin"), await staff("manager"), doctorAuth]) {
      const res = await request(app)
        .post(`/api/v1/partners/orthoapnea/patients/${fixture.patientId}/ensure`)
        .set("Authorization", auth)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.externalId).toMatch(/^oa-pat-/);
    }
  });
});

describe("NEO-199 POST /partners/orthoapnea/treatments/:id/comments", () => {
  it("403 for a rep asking to notify OrthoApnea — no email, no note", async () => {
    vi.stubGlobal("fetch", fetchSpy);
    const body = `neo199-rep-${uniqueSuffix()}`;
    const res = await request(app)
      .post(`/api/v1/partners/orthoapnea/treatments/${fixture.planId}/comments`)
      .set("Authorization", await staff("rep"))
      .send({ body, notifyOrthoApnea: true });
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    const { rows } = await withTenant(TENANT_SLUG, (client) => client.query("SELECT 1 FROM note WHERE body = $1", [body]));
    expect(rows).toHaveLength(0);
  });
});
