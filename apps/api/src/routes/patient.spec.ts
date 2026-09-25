import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Auth-boundary tests for the new Historia Endo / STOP-Bang sub-routes (see
 * docs/stories/historia-endo-clinical-intake-and-printable-pdf.md).
 * requireAuth throughout — matches this router's existing gating, same as
 * routes/entityDocuments.spec.ts's own reasoning for the Documents tab
 * sub-routes. Deliberately does NOT hit the two generate-pdf routes here —
 * those trigger a real Puppeteer render via the unmocked route stack;
 * commands/endoIntake.spec.ts / commands/stopBangScreening.spec.ts already
 * cover that command logic with renderHtmlToPdf mocked at the boundary.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function insertTestUser(
  client: Parameters<typeof insertStaffUser>[0],
  role: StaffRole
): Promise<{ id: string; email: string }> {
  const email = `qa-patient-route-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
  return { id: user!.id, email };
}

function tokenFor(user: { id: string; email: string }, role: StaffRole): string {
  return signAuthToken({ id: user.id, email: user.email, role, token_version: 0 });
}

describe("GET/PUT /api/v1/patient/:id/endo-intake", () => {
  it("401s with no token", async () => {
    const res = await request(app).get(`/api/v1/patient/${crypto.randomUUID()}/endo-intake`);
    expect(res.status).toBe(401);
  });

  it("200s (null) for any authenticated staff role, e.g. rep, when no intake exists yet", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const patient = await withTenant(TENANT_SLUG, (client) => insertPatient(client, { first_name: "Route", last_name: `Test-${uniqueSuffix()}` }));

    const res = await request(app)
      .get(`/api/v1/patient/${patient.id}/endo-intake`)
      .set("Authorization", `Bearer ${tokenFor(rep, "rep")}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("full round trip: PUT saves the checklist, GET returns it", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const patient = await withTenant(TENANT_SLUG, (client) => insertPatient(client, { first_name: "RoundTrip", last_name: `Test-${uniqueSuffix()}` }));
    const auth = `Bearer ${tokenFor(rep, "rep")}`;

    const put = await request(app)
      .put(`/api/v1/patient/${patient.id}/endo-intake`)
      .set("Authorization", auth)
      .send({ has_diabetes: true, skeletal_class: "II" });
    expect(put.status).toBe(200);
    expect(put.body.has_diabetes).toBe(true);

    const get = await request(app).get(`/api/v1/patient/${patient.id}/endo-intake`).set("Authorization", auth);
    expect(get.status).toBe(200);
    expect(get.body.skeletal_class).toBe("II");
  });

  it("400s an invalid boolean value", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const patient = await withTenant(TENANT_SLUG, (client) => insertPatient(client, { first_name: "Invalid", last_name: `Test-${uniqueSuffix()}` }));

    const res = await request(app)
      .put(`/api/v1/patient/${patient.id}/endo-intake`)
      .set("Authorization", `Bearer ${tokenFor(rep, "rep")}`)
      .send({ has_diabetes: "not-a-boolean" });
    expect(res.status).toBe(400);
  });
});

describe("GET/POST /api/v1/patient/:id/stop-bang", () => {
  it("401s with no token", async () => {
    const res = await request(app).get(`/api/v1/patient/${crypto.randomUUID()}/stop-bang`);
    expect(res.status).toBe(401);
  });

  it("200s (empty list) for any authenticated staff role", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const patient = await withTenant(TENANT_SLUG, (client) => insertPatient(client, { first_name: "StopBang", last_name: `Route-${uniqueSuffix()}` }));

    const res = await request(app)
      .get(`/api/v1/patient/${patient.id}/stop-bang`)
      .set("Authorization", `Bearer ${tokenFor(rep, "rep")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("full round trip: POST records a screening, GET lists it with a computed score", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const patient = await withTenant(TENANT_SLUG, (client) => insertPatient(client, { first_name: "ScoreTest", last_name: `Route-${uniqueSuffix()}` }));
    const auth = `Bearer ${tokenFor(rep, "rep")}`;

    const post = await request(app)
      .post(`/api/v1/patient/${patient.id}/stop-bang`)
      .set("Authorization", auth)
      .send({
        snoring: true, tiredness: true, observed_apnea: false, pressure: false,
        bmi_over_35: false, age_over_50: false, neck_circumference_over_40cm: false, is_male: false,
      });
    expect(post.status).toBe(201);
    expect(post.body.score).toBe(2);

    const get = await request(app).get(`/api/v1/patient/${patient.id}/stop-bang`).set("Authorization", auth);
    expect(get.status).toBe(200);
    expect(get.body).toHaveLength(1);
    expect(get.body[0].score).toBe(2);
  });

  it("400s a POST missing a required field", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const patient = await withTenant(TENANT_SLUG, (client) => insertPatient(client, { first_name: "Missing", last_name: `Route-${uniqueSuffix()}` }));

    const res = await request(app)
      .post(`/api/v1/patient/${patient.id}/stop-bang`)
      .set("Authorization", `Bearer ${tokenFor(rep, "rep")}`)
      .send({ snoring: true });
    expect(res.status).toBe(400);
  });
});

// NEO-56: date of birth is the patient's second identifier (shown next to the
// name in the PWA breadcrumbs). Stored on identities.date_of_birth, returned as
// a plain "YYYY-MM-DD" — never a timestamp, so it can't shift a day in MX.
describe("patient date_of_birth (POST / PATCH / GET /api/v1/patient)", () => {
  async function adminAuth(): Promise<string> {
    const admin = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "admin"));
    return `Bearer ${tokenFor(admin, "admin")}`;
  }
  const base = () => ({
    first_name: "Dob",
    last_name: `Route-${uniqueSuffix()}`,
    email: `dob-${uniqueSuffix()}@example.com`,
    phone: "+48 600 100 200",
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

  it("is null when not given", async () => {
    const auth = await adminAuth();
    const post = await request(app).post("/api/v1/patient").set("Authorization", auth).send(base());
    expect(post.status).toBe(201);
    expect(post.body.date_of_birth).toBeNull();
  });

  it("PATCH changes it, null clears it, omitting it leaves it alone", async () => {
    const auth = await adminAuth();
    const post = await request(app).post("/api/v1/patient").set("Authorization", auth).send({ ...base(), date_of_birth: "1990-01-31" });
    const id = post.body.id as string;

    const changed = await request(app).patch(`/api/v1/patient/${id}`).set("Authorization", auth).send({ date_of_birth: "1991-02-28" });
    expect(changed.status).toBe(200);
    expect(changed.body.date_of_birth).toBe("1991-02-28");

    const untouched = await request(app).patch(`/api/v1/patient/${id}`).set("Authorization", auth).send({ status: "follow_up" });
    expect(untouched.body.date_of_birth).toBe("1991-02-28");

    const cleared = await request(app).patch(`/api/v1/patient/${id}`).set("Authorization", auth).send({ date_of_birth: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.date_of_birth).toBeNull();
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
