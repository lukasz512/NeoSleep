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

/** Each fixture visit gets its own 2-hour slot: a doctor can't be double-booked (appointment_no_double_booking). */
let slot = 0;
const nextSlot = (): Date => new Date(inDays(2).getTime() + slot++ * 2 * 3_600_000);

/** A patient with one of every waiting state: results received, an initiated plan, a "can't attend" visit, no consent. */
async function waitingPatient(doc: Doctor | null, owner: Doctor): Promise<Fixture> {
  return withTenant(TENANT_SLUG, async (client) => {
    const p = await insertPatient(client, { first_name: "Panel", last_name: `Patient-${uniqueSuffix()}`, practitioner_id: doc?.practitionerId });
    const study = await insertSleepStudy(client, { patient_id: p.id, status: "results_received", results_received_at: new Date().toISOString() });
    const plan = await insertTreatmentPlan(client, { patient_id: p.id, sleep_study_id: study.id, type: "dental_appliance" });
    // Appointments always belong to a real practitioner; an unassigned patient's goes to `owner`.
    const start = nextSlot();
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

interface Summary {
  enabled: boolean;
  stages: Record<string, number>;
  incomplete: { patient_id: string; missing: string[]; done: number; total: number }[];
}

async function summary(auth: string): Promise<Summary> {
  const res = await request(app).get("/api/v1/doctor-panel/summary").set("Authorization", auth);
  expect(res.status).toBe(200);
  return res.body as Summary;
}

/** A patient of `doc` at a given stage: study/plan statuses are the only thing that decides it. */
async function patientAt(doc: Doctor, stage: "intake" | "study" | "results" | "plan" | "treatment", contact = { email: "", phone: "" }): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const p = await insertPatient(client, {
      first_name: "Stage",
      last_name: `${stage}-${uniqueSuffix()}`,
      practitioner_id: doc.practitionerId,
      email: contact.email || undefined,
      phone: contact.phone || undefined,
    });
    if (stage === "intake") return p.id;
    const study = await insertSleepStudy(client, { patient_id: p.id, status: stage === "study" ? "ordered" : "interpreted" });
    if (stage === "plan" || stage === "treatment") {
      const plan = await insertTreatmentPlan(client, { patient_id: p.id, sleep_study_id: study.id, type: "dental_appliance" });
      if (stage === "treatment") await client.query(`UPDATE treatment_plan SET status = 'in_progress' WHERE id = $1`, [plan.id]);
    }
    return p.id;
  });
}

describe("NEO-233 doctor panel summary — stages and incomplete files", () => {
  it("counts each own active patient once, at the furthest stage reached", async () => {
    const c = await doctor();
    for (const stage of ["intake", "study", "results", "plan", "treatment"] as const) await patientAt(c, stage);
    const discharged = await patientAt(c, "treatment");
    await withTenant(TENANT_SLUG, (client) => client.query(`UPDATE patient SET status = 'discharged' WHERE id = $1`, [discharged]));
    await patientAt(b, "intake");
    const { enabled, stages } = await summary(c.auth);
    expect(enabled).toBe(true);
    expect(stages).toEqual({ intake: 1, study: 1, results: 1, plan: 1, treatment: 1 });
  });

  it("lists a missing phone and email next to the checklist, least complete first", async () => {
    const c = await doctor();
    const bare = await patientAt(c, "intake");
    const reachable = await patientAt(c, "intake", { email: `p-${uniqueSuffix()}@example.invalid`, phone: "+52 55 1234 5678" });
    await withTenant(TENANT_SLUG, (client) =>
      insertConsent(client, { entity_type: "patient", entity_id: reachable, legal_basis: "consent", jurisdiction: "MX", purpose: CONSENT_KEY })
    );
    const { incomplete } = await summary(c.auth);
    const rowOf = (id: string) => incomplete.find((i) => i.patient_id === id)!;
    expect(rowOf(bare).missing).toEqual(expect.arrayContaining(["phone", "email", CONSENT_KEY]));
    expect(rowOf(reachable).missing).not.toContain("phone");
    expect(rowOf(reachable).missing).not.toContain("email");
    expect(rowOf(reachable).missing).not.toContain(CONSENT_KEY);
    for (const row of incomplete) expect(row.done + row.missing.length).toBe(row.total);
    expect(incomplete.map((i) => i.patient_id)).toEqual([bare, reachable]);
  });

  it("never counts another doctor's patient", async () => {
    const c = await doctor();
    const theirs = await patientAt(b, "intake");
    const { stages, incomplete } = await summary(c.auth);
    expect(Object.values(stages).reduce((x, y) => x + y, 0)).toBe(0);
    expect(incomplete.some((i) => i.patient_id === theirs)).toBe(false);
  });

  it("switched off → enabled false, nothing counted", async () => {
    await setDoctorPanelEnabled(false);
    try {
      const res = await summary(a.auth);
      expect(res.enabled).toBe(false);
      expect(res.incomplete).toEqual([]);
    } finally {
      await setDoctorPanelEnabled(true);
    }
  });

  it("rep gets 403", async () => {
    const res = await request(app).get("/api/v1/doctor-panel/summary").set("Authorization", await staff("rep"));
    expect(res.status).toBe(403);
  });
});

afterEach(() => {
  __setLabOrdersDeployEnvForTests(null);
});
