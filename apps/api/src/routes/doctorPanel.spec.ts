import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, insertSleepStudy, insertTreatmentPlan, insertAppointment, insertConsent } from "../db.js";
import { setDoctorPanelEnabled, __setLabOrdersDeployEnvForTests } from "../db/config.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * NEO-233 Doctor Panel, tile ② "Needs your action" — real Express stack + real Postgres.
 * One item per thing waiting on the doctor, own patients only (CORE-104), and a resolved
 * state drops out. The per-tenant switch hides everything when off.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const CONSENT_KEY = "informedConsent";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Doctor { practitionerId: string; userId: string; auth: string }

async function doctor(): Promise<Doctor> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-neo233-doc-${uniqueSuffix()}@neosleepcare.com`;
    const practitioner = await insertPractitioner(client, { first_name: "Doc", last_name: `Panel-${uniqueSuffix()}`, email });
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "Doc", "Panel", "doctor", hash, false);
    return { practitionerId: practitioner.id, userId: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "doctor", token_version: 0 })}` };
  });
}

async function staff(role: StaffRole): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-neo233-${role}-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Panel", role, hash, false);
    return `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`;
  });
}

interface Fixture { patientId: string; studyId: string; planId: string; appointmentId: string }

const inDays = (days: number): Date => new Date(Date.now() + days * 86_400_000);

/** A patient with one of every waiting state: results received, an initiated plan, a "can't attend" visit, no consent. */
async function waitingPatient(doc: Doctor | null, owner: Doctor): Promise<Fixture> {
  return withTenant(TENANT_SLUG, async (client) => {
    const p = await insertPatient(client, { first_name: "Panel", last_name: `Patient-${uniqueSuffix()}`, practitioner_id: doc?.practitionerId });
    const study = await insertSleepStudy(client, { patient_id: p.id, status: "results_received", results_received_at: new Date().toISOString() });
    const plan = await insertTreatmentPlan(client, { patient_id: p.id, sleep_study_id: study.id, type: "dental_appliance" });
    // Appointments always belong to a real practitioner; an unassigned patient's goes to `owner`.
    const start = inDays(2 + Math.random());
    const appointment = await insertAppointment(client, {
      patient_id: p.id,
      practitioner_id: (doc ?? owner).practitionerId,
      organization_id: null,
      territory_id: null,
      created_by_user_id: (doc ?? owner).userId,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + 3_600_000).toISOString(),
      timezone: "UTC",
    });
    await client.query(`UPDATE appointment SET patient_response = 'cannot_attend', patient_responded_at = now() WHERE id = $1`, [appointment.id]);
    return { patientId: p.id, studyId: study.id, planId: plan.id, appointmentId: appointment.id };
  });
}

interface ActionItem { kind: string; patient_id: string; patient_name: string | null; ref_id: string }

async function actions(auth: string): Promise<{ enabled: boolean; items: ActionItem[] }> {
  const res = await request(app).get("/api/v1/doctor-panel/actions").set("Authorization", auth);
  expect(res.status).toBe(200);
  return res.body as { enabled: boolean; items: ActionItem[] };
}

const kindsFor = (items: ActionItem[], patientId: string): string[] => items.filter((i) => i.patient_id === patientId).map((i) => i.kind).sort();

let a: Doctor;
let b: Doctor;

beforeAll(async () => {
  await setDoctorPanelEnabled(true);
  a = await doctor();
  b = await doctor();
});

afterAll(async () => {
  __setLabOrdersDeployEnvForTests(null);
  await setDoctorPanelEnabled(null);
});

describe("NEO-233 doctor panel actions — what waits on the doctor", () => {
  it("lists every waiting state of the doctor's own patient, with the record to act on", async () => {
    const mine = await waitingPatient(a, a);
    const { enabled, items } = await actions(a.auth);
    expect(enabled).toBe(true);
    expect(kindsFor(items, mine.patientId)).toEqual(["cannot_attend", "consent_missing", "plan_not_notified", "results_to_interpret"]);
    const refs = Object.fromEntries(items.filter((i) => i.patient_id === mine.patientId).map((i) => [i.kind, i.ref_id]));
    expect(refs).toEqual({
      results_to_interpret: mine.studyId,
      cannot_attend: mine.appointmentId,
      plan_not_notified: mine.planId,
      consent_missing: CONSENT_KEY,
    });
    expect(items.find((i) => i.patient_id === mine.patientId)?.patient_name).toMatch(/^Panel Patient-/);
  });

  it("never shows another doctor's or an unassigned patient", async () => {
    const theirs = await waitingPatient(b, b);
    const unassigned = await waitingPatient(null, b);
    const { items } = await actions(a.auth);
    expect(kindsFor(items, theirs.patientId)).toEqual([]);
    expect(kindsFor(items, unassigned.patientId)).toEqual([]);
    expect(items.every((i) => i.patient_id !== theirs.patientId)).toBe(true);
  });

  it("drops each item once it is resolved", async () => {
    const mine = await waitingPatient(a, a);
    await withTenant(TENANT_SLUG, async (client) => {
      await client.query(`UPDATE sleep_study SET status = 'interpreted', interpreted_at = now() WHERE id = $1`, [mine.studyId]);
      await client.query(`UPDATE treatment_plan SET status = 'patient_notified' WHERE id = $1`, [mine.planId]);
      await client.query(`UPDATE appointment SET patient_response = 'confirmed' WHERE id = $1`, [mine.appointmentId]);
      await insertConsent(client, { entity_type: "patient", entity_id: mine.patientId, legal_basis: "consent", jurisdiction: "MX", purpose: CONSENT_KEY });
    });
    const { items } = await actions(a.auth);
    expect(kindsFor(items, mine.patientId)).toEqual([]);
  });

  it("a consent scan attached to the checklist item counts as signed; a withdrawn consent does not", async () => {
    const scanned = await waitingPatient(a, a);
    const withdrawn = await waitingPatient(a, a);
    await withTenant(TENANT_SLUG, async (client) => {
      await client.query(
        `INSERT INTO file_attachment (entity_type, entity_id, url, filename, metadata)
         VALUES ('patient', $1, 'https://example.invalid/consent.pdf', 'consent.pdf', $2)`,
        [scanned.patientId, JSON.stringify({ checklist_item: CONSENT_KEY, document_type: "study_upload" })]
      );
      const consentId = await insertConsent(client, { entity_type: "patient", entity_id: withdrawn.patientId, legal_basis: "consent", jurisdiction: "MX", purpose: CONSENT_KEY });
      await client.query(`UPDATE consent SET withdrawn_at = now() WHERE id = $1`, [consentId]);
    });
    const { items } = await actions(a.auth);
    expect(kindsFor(items, scanned.patientId)).not.toContain("consent_missing");
    expect(kindsFor(items, withdrawn.patientId)).toContain("consent_missing");
  });

  it("a past 'can't attend' visit and a discharged patient's consent are not actions", async () => {
    const mine = await waitingPatient(a, a);
    await withTenant(TENANT_SLUG, async (client) => {
      await client.query(`UPDATE appointment SET start_at = now() - interval '2 days', end_at = now() - interval '2 days' + interval '1 hour' WHERE id = $1`, [mine.appointmentId]);
      await client.query(`UPDATE patient SET status = 'discharged' WHERE id = $1`, [mine.patientId]);
    });
    const { items } = await actions(a.auth);
    expect(kindsFor(items, mine.patientId)).toEqual(["plan_not_notified", "results_to_interpret"]);
  });
});

describe("NEO-233 doctor panel actions — access and switch", () => {
  it.each<StaffRole>(["admin", "manager", "rep"])("%s gets 403", async (role) => {
    const res = await request(app).get("/api/v1/doctor-panel/actions").set("Authorization", await staff(role));
    expect(res.status).toBe(403);
  });

  it("no token → 401", async () => {
    const res = await request(app).get("/api/v1/doctor-panel/actions");
    expect(res.status).toBe(401);
  });

  it("switched off → enabled false and no items, even with waiting patients", async () => {
    await waitingPatient(a, a);
    await setDoctorPanelEnabled(false);
    try {
      expect(await actions(a.auth)).toEqual({ enabled: false, items: [] });
    } finally {
      await setDoctorPanelEnabled(true);
    }
  });

  it("no explicit value → on in dev, off on prod", async () => {
    await setDoctorPanelEnabled(null);
    try {
      __setLabOrdersDeployEnvForTests("dev");
      expect((await actions(a.auth)).enabled).toBe(true);
      __setLabOrdersDeployEnvForTests("prod");
      expect((await actions(a.auth)).enabled).toBe(false);
    } finally {
      __setLabOrdersDeployEnvForTests(null);
      await setDoctorPanelEnabled(true);
    }
  });
});

afterEach(() => {
  __setLabOrdersDeployEnvForTests(null);
});
