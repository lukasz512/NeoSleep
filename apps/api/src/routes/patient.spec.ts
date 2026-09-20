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
