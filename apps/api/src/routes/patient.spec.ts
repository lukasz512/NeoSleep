import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";
import { MEDICAL_HISTORY_QUESTIONS } from "../commands/clinicalRecordFields.js";

/**
 * HTTP-level coverage for the clinical questionnaire routes (Estudios) and
 * the patient self-fill public routes (migration 030, ADR-023): auth
 * boundaries, status codes, and one full doctor → QR → patient → doctor
 * round trip through the real Express stack and real Postgres. The PDF
 * route is covered in commands/clinicalRecords.spec.ts (it needs the
 * Supabase Storage boundary mocked).
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function insertTestUser(client: Parameters<typeof insertStaffUser>[0], role: StaffRole): Promise<{ id: string; email: string }> {
  const email = `qa-patient-route-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
  return { id: user!.id, email };
}

async function authAndPatient(role: StaffRole = "rep"): Promise<{ auth: string; patientId: string }> {
  const user = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, role));
  const patient = await withTenant(TENANT_SLUG, (client) =>
    insertPatient(client, { first_name: "Route", last_name: `Test-${uniqueSuffix()}` })
  );
  return { auth: `Bearer ${signAuthToken({ id: user.id, email: user.email, role, token_version: 0 })}`, patientId: patient.id };
}

describe("/api/v1/patient/:id/clinical-records", () => {
  it("401s with no token", async () => {
    const res = await request(app).get(`/api/v1/patient/${crypto.randomUUID()}/clinical-records`);
    expect(res.status).toBe(401);
  });

  it("400s for an unknown questionnaire kind", async () => {
    const { auth, patientId } = await authAndPatient();
    const res = await request(app).post(`/api/v1/patient/${patientId}/clinical-records/bogus`).set("Authorization", auth).send({});
    expect(res.status).toBe(400);
  });

  it("round trip: POST records an oral exam, GET lists it", async () => {
    const { auth, patientId } = await authAndPatient();
    const created = await request(app)
      .post(`/api/v1/patient/${patientId}/clinical-records/oral_exam`)
      .set("Authorization", auth)
      .send({ has_bruxism: true, skeletal_class: "III" });
    expect(created.status).toBe(201);

    const list = await request(app).get(`/api/v1/patient/${patientId}/clinical-records`).set("Authorization", auth);
    expect(list.status).toBe(200);
    expect(list.body.records).toHaveLength(1);
    expect(list.body.records[0]).toMatchObject({ kind: "oral_exam", has_bruxism: true, skeletal_class: "III" });
  });
});

describe("patient self-fill: doctor → QR link → patient (public) → doctor", () => {
  it("works end to end over HTTP, and the used link then answers 410", async () => {
    const { auth, patientId } = await authAndPatient();

    const created = await request(app)
      .post(`/api/v1/patient/${patientId}/questionnaire-requests`)
      .set("Authorization", auth)
      .send({ kind: "stop_bang" });
    expect(created.status).toBe(201);
    const token = String(created.body.url).split("/q#")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Public — no Authorization header at all.
    const view = await request(app).post("/api/v1/public/questionnaire/lookup").send({ token });
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ kind: "stop_bang", patient_first_name: "Route" });

    const submit = await request(app)
      .post("/api/v1/public/questionnaire/submit")
      .send({ token, consent: true, answers: { snoring: true, tiredness: true, observed_apnea: false, pressure: false } });
    expect(submit.status).toBe(201);

    const again = await request(app).post("/api/v1/public/questionnaire/lookup").send({ token });
    expect(again.status).toBe(410);
    expect(again.body.code).toBe("LINK_INVALID");

    // The doctor sees it, completes B-A-N-G, and gets the Postgres-computed score.
    const list = await request(app).get(`/api/v1/patient/${patientId}/clinical-records`).set("Authorization", auth);
    const screening = list.body.records[0];
    expect(screening).toMatchObject({ kind: "stop_bang", source: "patient", score: null });

    const completed = await request(app)
      .patch(`/api/v1/patient/${patientId}/clinical-records/stop_bang/${screening.id}`)
      .set("Authorization", auth)
      .send({ bmi_over_35: false, age_over_50: true, neck_circumference_over_40cm: false, is_male: true });
    expect(completed.status).toBe(200);
    expect(completed.body.score).toBe(4);
  });

  it("410s for a token that never existed, with the same body as a used one", async () => {
    const res = await request(app).post("/api/v1/public/questionnaire/lookup").send({ token: "x".repeat(43) });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("LINK_INVALID");
  });

  it("two simultaneous submits of one link: exactly one wins, the other gets 410 (row lock, real Postgres)", async () => {
    const { auth, patientId } = await authAndPatient();
    const created = await request(app)
      .post(`/api/v1/patient/${patientId}/questionnaire-requests`)
      .set("Authorization", auth)
      .send({ kind: "stop_bang" });
    const token = String(created.body.url).split("/q#")[1];
    const body = { token, consent: true, answers: { snoring: true, tiredness: false, observed_apnea: false, pressure: false } };

    const [a, b] = await Promise.all([
      request(app).post("/api/v1/public/questionnaire/submit").send(body),
      request(app).post("/api/v1/public/questionnaire/submit").send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 410]);

    const list = await request(app).get(`/api/v1/patient/${patientId}/clinical-records`).set("Authorization", auth);
    expect(list.body.records.filter((r: { kind: string }) => r.kind === "stop_bang")).toHaveLength(1);
  });

  it("a link for a patient deleted in the meantime is dead for lookup AND submit", async () => {
    const { auth, patientId } = await authAndPatient();
    const created = await request(app)
      .post(`/api/v1/patient/${patientId}/questionnaire-requests`)
      .set("Authorization", auth)
      .send({ kind: "stop_bang" });
    const token = String(created.body.url).split("/q#")[1];
    await withTenant(TENANT_SLUG, (client) => client.query(`UPDATE patient SET deleted_at = now() WHERE id = $1`, [patientId]));

    const lookup = await request(app).post("/api/v1/public/questionnaire/lookup").send({ token });
    const submit = await request(app)
      .post("/api/v1/public/questionnaire/submit")
      .send({ token, consent: true, answers: { snoring: true, tiredness: false, observed_apnea: false, pressure: false } });
    expect([lookup.status, submit.status]).toEqual([410, 410]);
  });

  it("400s (not 500) for a malformed id", async () => {
    const { auth } = await authAndPatient();
    const res = await request(app).get("/api/v1/patient/not-a-uuid/clinical-records").set("Authorization", auth);
    expect(res.status).toBe(400);
  });

  it("the doctor can cancel a pending link", async () => {
    const { auth, patientId } = await authAndPatient();
    const created = await request(app)
      .post(`/api/v1/patient/${patientId}/questionnaire-requests`)
      .set("Authorization", auth)
      .send({ kind: "medical_history" });

    const cancel = await request(app).delete(`/api/v1/patient/${patientId}/questionnaire-requests/${created.body.id}`).set("Authorization", auth);
    expect(cancel.status).toBe(204);

    const token = String(created.body.url).split("/q#")[1];
    const submit = await request(app)
      .post("/api/v1/public/questionnaire/submit")
      .send({ token, consent: true, answers: Object.fromEntries(MEDICAL_HISTORY_QUESTIONS.map((q) => [q, false])) });
    expect(submit.status).toBe(410);
  });
});
