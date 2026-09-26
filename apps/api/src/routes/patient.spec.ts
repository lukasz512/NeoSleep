import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";
import { MEDICAL_HISTORY_QUESTIONS } from "../commands/clinicalRecordFields.js";

// Supabase Storage is the external boundary (uploads) — everything else is real.
vi.mock("../services/partnerDocuments.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/partnerDocuments.js")>()),
  uploadPartnerDocument: vi.fn(async (path: string) => ({ path, bucket: "partner-documents" })),
  deletePartnerDocument: vi.fn(async () => undefined),
}));

/**
 * HTTP-level coverage for the clinical questionnaire routes (Estudios) and
 * the patient self-fill public routes (migration 030, ADR-023): auth
 * boundaries, status codes, and one full doctor → QR → patient → doctor
 * round trip through the real Express stack and real Postgres, plus the
 * Estudios checklist / print / upload routes (ADR-024).
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

async function authAndPatient(role: StaffRole = "doctor"): Promise<{ auth: string; patientId: string }> {
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

  it.each(["rep", "kam", "msl"] as const)("403s for the commercial field-force role %s — studies are admin/doctor/manager only", async (role) => {
    const { auth, patientId } = await authAndPatient(role);
    const read = await request(app).get(`/api/v1/patient/${patientId}/clinical-records`).set("Authorization", auth);
    const link = await request(app).post(`/api/v1/patient/${patientId}/questionnaire-requests`).set("Authorization", auth).send({ kind: "stop_bang" });
    expect([read.status, link.status]).toEqual([403, 403]);
  });

  it("manager reads and edits the patient's studies and reads the Documents tab (NEO-83), but cannot hard delete", async () => {
    const { auth, patientId } = await authAndPatient("manager");
    const records = await request(app).get(`/api/v1/patient/${patientId}/clinical-records`).set("Authorization", auth);
    const checklist = await request(app).get(`/api/v1/patient/${patientId}/checklist`).set("Authorization", auth);
    const exam = await request(app)
      .post(`/api/v1/patient/${patientId}/clinical-records/oral_exam`)
      .set("Authorization", auth)
      .send({ has_bruxism: true });
    const created = await request(app).post("/api/v1/sleep-study").set("Authorization", auth).send({ patient_id: patientId });
    const updated = await request(app).patch(`/api/v1/sleep-study/${created.body.id}`).set("Authorization", auth).send({ ahi_score: 12 });
    const listed = await request(app).get(`/api/v1/sleep-study?patient_id=${patientId}`).set("Authorization", auth);
    const hardDelete = await request(app).delete(`/api/v1/sleep-study/${created.body.id}`).set("Authorization", auth);
    const docs = await request(app).get(`/api/v1/patient/${patientId}/documents`).set("Authorization", auth);
    expect([records.status, checklist.status, exam.status, created.status, updated.status, listed.status, hardDelete.status, docs.status])
      .toEqual([200, 200, 201, 201, 200, 200, 403, 200]);
    expect(Number(updated.body.ahi_score)).toBe(12);
  });

  it("every health-data read leaves an audit_log 'read' row with the role; a 403 leaves none, and History hides reads (NEO-83)", async () => {
    const { auth, patientId } = await authAndPatient("manager");
    const created = await request(app).post("/api/v1/sleep-study").set("Authorization", auth).send({ patient_id: patientId });
    await request(app).get(`/api/v1/patient/${patientId}/checklist`).set("Authorization", auth);
    await request(app).get(`/api/v1/sleep-study/${created.body.id}`).set("Authorization", auth);
    const rep = await authAndPatient("rep");
    await request(app).get(`/api/v1/patient/${patientId}/clinical-records`).set("Authorization", rep.auth);

    const reads = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ entity_type: string; metadata: { view: string; role: string; patient_id: string } }>(
        `SELECT entity_type, metadata FROM audit_log WHERE action = 'read' AND metadata->>'patient_id' = $1 ORDER BY created_at`,
        [patientId],
      ),
    );
    expect(reads.rows.map((r) => [r.entity_type, r.metadata.view, r.metadata.role])).toEqual([
      ["Patient", "checklist", "manager"],
      ["SleepStudy", "sleep-study", "manager"],
    ]);

    const history = await request(app).get(`/api/v1/patient/${patientId}/history`).set("Authorization", auth);
    expect(history.status).toBe(200);
    expect(history.body.entries.map((e: { action: string }) => e.action)).not.toContain("read");
  });

  it.each(["rep", "kam", "msl"] as const)("403s %s on patient documents and sleep studies (health data), but still gives the latest sleep-study id for device orders", async (role) => {
    const { auth, patientId } = await authAndPatient(role);
    const docs = await request(app).get(`/api/v1/patient/${patientId}/documents`).set("Authorization", auth);
    const studies = await request(app).get(`/api/v1/sleep-study?patient_id=${patientId}`).set("Authorization", auth);
    const ref = await request(app).get(`/api/v1/patient/${patientId}/sleep-study-ref`).set("Authorization", auth);
    expect([docs.status, studies.status, ref.status]).toEqual([403, 403, 200]);
    expect(ref.body).toEqual({ id: null });
  });

  it("doctor reads the patient's documents (territory-checked)", async () => {
    const { auth, patientId } = await authAndPatient("doctor");
    const docs = await request(app).get(`/api/v1/patient/${patientId}/documents`).set("Authorization", auth);
    expect(docs.status).toBe(200);
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
    expect(view.body).toMatchObject({ patient_first_name: "Route", steps: [{ key: "stopBang", type: "stop_bang", done: false }] });

    const submit = await request(app)
      .post("/api/v1/public/questionnaire/submit")
      .send({ token, step: "stopBang", consent: true, answers: { snoring: true, tiredness: true, observed_apnea: false, pressure: false } });
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
    const body = { token, step: "stopBang", consent: true, answers: { snoring: true, tiredness: false, observed_apnea: false, pressure: false } };

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
      .send({ token, step: "stopBang", consent: true, answers: { snoring: true, tiredness: false, observed_apnea: false, pressure: false } });
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
      .send({ token, step: "medicalHistory", consent: true, answers: Object.fromEntries(MEDICAL_HISTORY_QUESTIONS.map((q) => [q, false])) });
    expect(submit.status).toBe(410);
  });
});

describe("/api/v1/patient/:id/checklist + print + uploads (Estudios, ADR-024)", () => {
  it("403s the commercial roles; a doctor gets the ordered checklist", async () => {
    const rep = await authAndPatient("rep");
    expect((await request(app).get(`/api/v1/patient/${rep.patientId}/checklist`).set("Authorization", rep.auth)).status).toBe(403);

    const { auth, patientId } = await authAndPatient("doctor");
    const res = await request(app).get(`/api/v1/patient/${patientId}/checklist`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.items.at(-1).key).toBe("polysomnography");
    expect(res.body.summary.total).toBe(res.body.items.length);
  });

  it("print streams a PDF (nothing stored)", async () => {
    const { auth, patientId } = await authAndPatient("doctor");
    const res = await request(app).post(`/api/v1/patient/${patientId}/checklist/medicalHistory/print`).set("Authorization", auth).send({});
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(Buffer.from(res.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 60000);

  it("uploads a study (multipart) that completes polysomnography; only an admin may delete it", async () => {
    const { auth, patientId } = await authAndPatient("doctor");
    const upload = await request(app)
      .post(`/api/v1/patient/${patientId}/studies/uploads`)
      .set("Authorization", auth)
      .field("title", "Polisomnografía")
      .field("notes", "IAH 22")
      .field("checklistItem", "polysomnography")
      .attach("file", Buffer.from("%PDF-1.4 test"), { filename: "psg.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);

    const checklist = await request(app).get(`/api/v1/patient/${patientId}/checklist`).set("Authorization", auth);
    expect(checklist.body.items.at(-1).status).toBe("done");

    const byDoctor = await request(app).delete(`/api/v1/patient/${patientId}/studies/uploads/${upload.body.id}`).set("Authorization", auth);
    expect(byDoctor.status).toBe(403);
    const admin = await authAndPatient("admin");
    const byAdmin = await request(app).delete(`/api/v1/patient/${patientId}/studies/uploads/${upload.body.id}`).set("Authorization", admin.auth);
    expect(byAdmin.status).toBe(204);
  });

  it("one QR link for everything: lookup lists the steps, each step submits on its own", async () => {
    const { auth, patientId } = await authAndPatient("doctor");
    const created = await request(app).post(`/api/v1/patient/${patientId}/questionnaire-requests`).set("Authorization", auth).send({});
    expect(created.status).toBe(201);
    const token = String(created.body.url).split("/q#")[1];

    const view = await request(app).post("/api/v1/public/questionnaire/lookup").send({ token, locale: "mx" });
    expect(view.body.steps.map((s: { key: string }) => s.key)).toEqual(["informedConsent", "medicalHistory", "stopBang"]);

    const step = await request(app)
      .post("/api/v1/public/questionnaire/submit")
      .send({ token, step: "stopBang", consent: true, answers: { snoring: false, tiredness: false, observed_apnea: false, pressure: false } });
    expect(step.status).toBe(201);
    expect(step.body).toEqual({ step: "stopBang", completed: false });
  });
});

// NEO-56: date of birth is the patient's second identifier (shown next to the
// name in the PWA breadcrumbs). Stored on identities.date_of_birth, returned as
// a plain "YYYY-MM-DD" — never a timestamp, so it can't shift a day in MX.
describe("patient date_of_birth (POST / PATCH / GET /api/v1/patient)", () => {
  async function adminAuth(): Promise<string> {
    const admin = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "admin"));
    return `Bearer ${signAuthToken({ id: admin.id, email: admin.email, role: "admin", token_version: 0 })}`;
  }
  const base = () => ({
    first_name: "Dob",
    last_name: `Route-${uniqueSuffix()}`,
    email: `dob-${uniqueSuffix()}@example.com`,
    phone: "+48 600 100 200",
    gender: "male",
  });

  it("round trip: create with a date of birth, read it back unchanged", async () => {
    const auth = await adminAuth();
    const post = await request(app).post("/api/v1/patient").set("Authorization", auth).send({ ...base(), date_of_birth: "1968-03-12" });
    expect(post.status).toBe(201);
    expect(post.body.date_of_birth).toBe("1968-03-12");

    const get = await request(app).get(`/api/v1/patient/${post.body.id}`).set("Authorization", auth);
    expect(get.status).toBe(200);
    expect(get.body.date_of_birth).toBe("1968-03-12");
  });

  // Sex and date of birth are required for patients (doctors never record them).
  it("400s when date of birth or sex is missing", async () => {
    const auth = await adminAuth();
    const noDob = await request(app).post("/api/v1/patient").set("Authorization", auth).send(base());
    expect(noDob.status).toBe(400);
    const noSex = await request(app).post("/api/v1/patient").set("Authorization", auth).send({ ...base(), gender: "", date_of_birth: "1968-03-12" });
    expect(noSex.status).toBe(400);
  });

  it("PATCH changes it, omitting it leaves it alone, clearing it (or sex) 400s", async () => {
    const auth = await adminAuth();
    const post = await request(app).post("/api/v1/patient").set("Authorization", auth).send({ ...base(), date_of_birth: "1990-01-31" });
    const id = post.body.id as string;

    const changed = await request(app).patch(`/api/v1/patient/${id}`).set("Authorization", auth).send({ date_of_birth: "1991-02-28" });
    expect(changed.status).toBe(200);
    expect(changed.body.date_of_birth).toBe("1991-02-28");

    const untouched = await request(app).patch(`/api/v1/patient/${id}`).set("Authorization", auth).send({ status: "follow_up" });
    expect(untouched.body.date_of_birth).toBe("1991-02-28");

    const cleared = await request(app).patch(`/api/v1/patient/${id}`).set("Authorization", auth).send({ date_of_birth: null });
    expect(cleared.status).toBe(400);
    const clearedSex = await request(app).patch(`/api/v1/patient/${id}`).set("Authorization", auth).send({ gender: null });
    expect(clearedSex.status).toBe(400);
  });

  it.each([
    ["not a date", "12.03.1968"],
    ["impossible day", "1990-02-30"],
    ["future", "2999-01-01"],
    ["before 1900", "1899-12-31"],
  ])("400s an invalid date of birth (%s)", async (_label, dob) => {
    const auth = await adminAuth();
    const res = await request(app).post("/api/v1/patient").set("Authorization", auth).send({ ...base(), date_of_birth: dob });
    expect(res.status).toBe(400);
  });
});
