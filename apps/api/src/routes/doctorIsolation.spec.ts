import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, insertSleepStudy, insertTreatmentPlan } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * CORE-104: a doctor sees only the patients assigned to them — through the real
 * Express stack and real Postgres. Doctor A on doctor B's patient gets 404
 * everywhere (never learns it exists); lists never contain it; writes can't reach
 * it; a doctor can't hand a patient to another doctor. Admin keeps seeing all.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Doctor { practitionerId: string; auth: string }

/** A practitioner plus the doctor login sharing its identity (ADR-014); global scope like real doctors. */
async function doctor(): Promise<Doctor> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-core104-doc-${uniqueSuffix()}@neosleepcare.com`;
    const practitioner = await insertPractitioner(client, { first_name: "Doc", last_name: `Iso-${uniqueSuffix()}`, email });
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "Doc", "Iso", "doctor", hash, false);
    return { practitionerId: practitioner.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "doctor", token_version: 0 })}` };
  });
}

async function staff(role: StaffRole): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-core104-${role}-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Iso", role, hash, false);
    return `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`;
  });
}

interface PatientFixture { patientId: string; studyId: string; planId: string }

async function patientOf(practitionerId: string | null): Promise<PatientFixture> {
  return withTenant(TENANT_SLUG, async (client) => {
    const p = await insertPatient(client, {
      first_name: "Iso",
      last_name: `Patient-${uniqueSuffix()}`,
      practitioner_id: practitionerId ?? undefined,
    });
    const study = await insertSleepStudy(client, { patient_id: p.id });
    const plan = await insertTreatmentPlan(client, { patient_id: p.id, sleep_study_id: study.id, type: "dental_appliance" });
    return { patientId: p.id, studyId: study.id, planId: plan.id };
  });
}

let a: Doctor;
let b: Doctor;
let mine: PatientFixture;
let theirs: PatientFixture;
let unassigned: PatientFixture;

beforeAll(async () => {
  a = await doctor();
  b = await doctor();
  mine = await patientOf(a.practitionerId);
  theirs = await patientOf(b.practitionerId);
  unassigned = await patientOf(null);
});

describe("CORE-104 doctor sees only own patients — lists", () => {
  it("GET /patient lists only own patients, ignoring a client practitioner_id", async () => {
    for (const query of ["", `?practitioner_id=${b.practitionerId}`]) {
      const res = await request(app).get(`/api/v1/patient${query}${query ? "&" : "?"}limit=500`).set("Authorization", a.auth);
      expect(res.status).toBe(200);
      const ids = (res.body.items as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(mine.patientId);
      expect(ids).not.toContain(theirs.patientId);
      expect(ids).not.toContain(unassigned.patientId);
      expect((res.body.items as { practitioner_id: string }[]).every((p) => p.practitioner_id === a.practitionerId)).toBe(true);
    }
  });

  it.each(["/api/v1/sleep-study", "/api/v1/treatment-plan"])("GET %s lists only own patients' records", async (path) => {
    const res = await request(app).get(`${path}?limit=500`).set("Authorization", a.auth);
    expect(res.status).toBe(200);
    const patientIds = new Set((res.body.items as { patient_id: string }[]).map((r) => r.patient_id));
    expect(patientIds.has(mine.patientId)).toBe(true);
    expect(patientIds.has(theirs.patientId)).toBe(false);
    expect(patientIds.has(unassigned.patientId)).toBe(false);
  });

  it.each(["/api/v1/sleep-study", "/api/v1/treatment-plan"])("GET %s?patient_id=<other doctor's> is empty", async (path) => {
    const res = await request(app).get(`${path}?patient_id=${theirs.patientId}`).set("Authorization", a.auth);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

describe("CORE-104 doctor sees only own patients — by id (404, never 200/403)", () => {
  const reads = (f: PatientFixture): string[] => [
    `/api/v1/patient/${f.patientId}`,
    `/api/v1/patient/${f.patientId}/history`,
    `/api/v1/patient/${f.patientId}/sleep-study-ref`,
    `/api/v1/patient/${f.patientId}/documents`,
    `/api/v1/patient/${f.patientId}/clinical-records`,
    `/api/v1/patient/${f.patientId}/checklist`,
    `/api/v1/patient/${f.patientId}/checklist/version`,
    `/api/v1/patient/${f.patientId}/version`,
    `/api/v1/patient/${f.patientId}/email-sends`,
    `/api/v1/sleep-study/${f.studyId}`,
    `/api/v1/sleep-study/${f.studyId}/attachments`,
    `/api/v1/treatment-plan/${f.planId}`,
    `/api/v1/note?entity_type=patient&entity_id=${f.patientId}`,
    `/api/v1/note?entity_type=treatment_plan&entity_id=${f.planId}`,
  ];

  it("every read of another doctor's patient answers 404", async () => {
    for (const path of reads(theirs)) {
      const res = await request(app).get(path).set("Authorization", a.auth);
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
    }
  });

  it("an unassigned patient is invisible to a doctor too", async () => {
    const res = await request(app).get(`/api/v1/patient/${unassigned.patientId}`).set("Authorization", a.auth);
    expect(res.status).toBe(404);
  });

  it("the doctor still reads their own patient everywhere", async () => {
    for (const path of reads(mine)) {
      const res = await request(app).get(path).set("Authorization", a.auth);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });
});

describe("CORE-104 doctor sees only own patients — writes", () => {
  it("can't edit, add studies/plans/notes, or create questionnaire links on another doctor's patient", async () => {
    const attempts: [string, string, object][] = [
      ["patch", `/api/v1/patient/${theirs.patientId}`, { status: "inactive" }],
      ["post", "/api/v1/sleep-study", { patient_id: theirs.patientId }],
      ["patch", `/api/v1/sleep-study/${theirs.studyId}`, { ahi_score: 99 }],
      ["post", "/api/v1/treatment-plan", { patient_id: theirs.patientId, sleep_study_id: theirs.studyId, type: "dental_appliance" }],
      ["patch", `/api/v1/treatment-plan/${theirs.planId}`, { status: "cancelled" }],
      ["post", "/api/v1/note", { entity_type: "patient", entity_id: theirs.patientId, body: "x" }],
      ["post", `/api/v1/patient/${theirs.patientId}/questionnaire-requests`, { templateKey: "stop_bang" }],
      ["post", `/api/v1/partners/orthoapnea/patients/${theirs.patientId}/ensure`, {}],
    ];
    for (const [method, path, body] of attempts) {
      const res = await (method === "patch" ? request(app).patch(path) : request(app).post(path)).set("Authorization", a.auth).send(body);
      expect({ path, method, status: res.status }).toEqual({ path, method, status: 404 });
    }
  });

  it("a doctor's new patient is always their own", async () => {
    const res = await request(app).post("/api/v1/patient").set("Authorization", a.auth).send({
      first_name: "New", last_name: `Own-${uniqueSuffix()}`,
      email: `qa-core104-new-${uniqueSuffix()}@neosleepcare.com`, phone: "600100200",
      gender: "female", date_of_birth: "1980-01-01",
    });
    expect(res.status).toBe(201);
    expect(res.body.practitioner_id).toBe(a.practitionerId);
  });

  it("a doctor can't create a patient for, or hand their patient to, another doctor", async () => {
    const create = await request(app).post("/api/v1/patient").set("Authorization", a.auth).send({
      first_name: "New", last_name: `Other-${uniqueSuffix()}`,
      email: `qa-core104-other-${uniqueSuffix()}@neosleepcare.com`, phone: "600100200",
      gender: "female", date_of_birth: "1980-01-01", practitioner_id: b.practitionerId,
    });
    expect(create.status).toBe(403);
    const reassign = await request(app).patch(`/api/v1/patient/${mine.patientId}`).set("Authorization", a.auth).send({ practitioner_id: b.practitionerId });
    expect(reassign.status).toBe(403);
  });

  it("an empty doctor picker (null) keeps the patient the doctor's own", async () => {
    const res = await request(app).patch(`/api/v1/patient/${mine.patientId}`).set("Authorization", a.auth).send({ practitioner_id: null });
    expect(res.status).toBe(200);
    expect(res.body.practitioner_id).toBe(a.practitionerId);
  });
});

describe("CORE-104 — other roles", () => {
  it("a doctor login not linked to a practitioner gets 403", async () => {
    const res = await request(app).get("/api/v1/patient").set("Authorization", await staff("doctor"));
    expect(res.status).toBe(403);
  });

  it("admin still sees every doctor's patients and their records", async () => {
    const admin = await staff("admin");
    for (const path of [`/api/v1/patient/${theirs.patientId}`, `/api/v1/sleep-study/${theirs.studyId}`, `/api/v1/treatment-plan/${theirs.planId}`, `/api/v1/patient/${unassigned.patientId}`]) {
      const res = await request(app).get(path).set("Authorization", admin);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });
});
