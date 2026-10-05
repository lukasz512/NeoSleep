import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, getCountryTerritoryId, insertAuditLog } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * CORE-132: patient care team through the real Express stack and real Postgres.
 * Decisions care-team-r1 (docs/stories/patient-care-team-booking-assigns-hcp.md):
 * booking with an HCP outside the team adds them (confirmed by grant_access), they
 * then see the patient like the primary doctor does; a cancelled visit takes access
 * back unless they treated the patient; admin/manager remove, the field force only
 * adds; only an admin replaces the primary doctor, who stays on the team.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let slotCounter = 0;
function futureSlot(): string {
  slotCounter += 3;
  const base = Date.UTC(2032, 0, 1, 8, 0, 0) + slotCounter * 3_600_000 + Math.floor(Math.random() * 1_000) * 86_400_000;
  return new Date(base).toISOString();
}

interface Actor {
  id: string;
  auth: string;
}

async function staff(role: StaffRole, country: "PL" | "MX" = "MX"): Promise<Actor> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-careteam-${role}-${uniqueSuffix()}@neosleepcare.com`;
    const scope = role === "admin" ? null : await getCountryTerritoryId(client, country);
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false, null, null, scope);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

interface Doctor {
  practitionerId: string;
  login: Actor;
}

async function doctor(specialty: string): Promise<Doctor> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-careteam-doc-${uniqueSuffix()}@neosleepcare.com`;
    const practitioner = await insertPractitioner(client, { first_name: "Doc", last_name: `Team-${uniqueSuffix()}`, email, primary_specialty: specialty });
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "Doc", "Team", "doctor", hash, false);
    return {
      practitionerId: practitioner.id,
      login: { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "doctor", token_version: 0 })}` },
    };
  });
}

async function patient(primaryPractitionerId: string): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const p = await insertPatient(client, {
      first_name: "Team",
      last_name: `Patient-${uniqueSuffix()}`,
      practitioner_id: primaryPractitionerId,
      territory_id: await getCountryTerritoryId(client, "MX"),
    });
    return p.id;
  });
}

async function teamRows(patientId: string): Promise<{ practitioner_id: string; source: string; appointment_id: string | null }[]> {
  const { rows } = await withTenant(TENANT_SLUG, (client) =>
    client.query(`SELECT practitioner_id, source, appointment_id FROM patient_practitioner WHERE patient_id = $1 ORDER BY created_at`, [patientId])
  );
  return rows;
}

async function book(auth: string, patientId: string, practitionerId: string, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: patientId, practitioner_id: practitionerId, start_at: futureSlot(), ...extra });
}

async function canOpen(doc: Doctor, patientId: string): Promise<number> {
  return (await request(app).get(`/api/v1/patient/${patientId}`).set("Authorization", doc.login.auth)).status;
}

describe("patient care team (CORE-132)", () => {
  it("booking with an HCP outside the team needs grant_access, then adds them with an audit entry and they see the patient", async () => {
    const admin = await staff("admin");
    const sleepDoc = await doctor("sleep_medicine");
    const ent = await doctor("ent");
    const outsider = await doctor("dentist");
    const patientId = await patient(sleepDoc.practitionerId);

    const unconfirmed = await book(admin.auth, patientId, ent.practitionerId);
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.field ?? unconfirmed.body.error?.field).toBe("grant_access");
    expect(await teamRows(patientId)).toEqual([]);

    const booked = await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });
    expect(booked.status).toBe(201);
    expect(await teamRows(patientId)).toEqual([{ practitioner_id: ent.practitionerId, source: "appointment", appointment_id: booked.body.id }]);

    const audit = await withTenant(TENANT_SLUG, (client) =>
      client.query(`SELECT user_id, entity_after FROM audit_log WHERE entity_type = 'PatientCareTeam' AND action = 'create' AND entity_after->>'patient_id' = $1`, [patientId])
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].user_id).toBe(admin.id);
    expect(audit.rows[0].entity_after.practitioner_id).toBe(ent.practitionerId);

    expect(await canOpen(ent, patientId)).toBe(200);
    expect(await canOpen(sleepDoc, patientId)).toBe(200);
    expect(await canOpen(outsider, patientId)).toBe(404);

    const list = await request(app).get("/api/v1/patient?limit=100").set("Authorization", ent.login.auth);
    expect(list.status).toBe(200);
    expect(list.body.items.map((p: { id: string }) => p.id)).toEqual([patientId]);
    const outsiderList = await request(app).get("/api/v1/patient").set("Authorization", outsider.login.auth);
    expect(outsiderList.body.items).toEqual([]);
  });

  it("booking with the primary doctor or a member already on the team adds nothing and needs no confirmation", async () => {
    const admin = await staff("admin");
    const sleepDoc = await doctor("sleep_medicine");
    const ent = await doctor("ent");
    const patientId = await patient(sleepDoc.practitionerId);

    expect((await book(admin.auth, patientId, sleepDoc.practitionerId)).status).toBe(201);
    expect((await book(admin.auth, patientId, ent.practitionerId, { grant_access: true })).status).toBe(201);
    expect((await book(admin.auth, patientId, ent.practitionerId)).status).toBe(201);
    expect((await teamRows(patientId)).map((r) => r.practitioner_id)).toEqual([ent.practitionerId]);
  });

  it("a team member books their care-team patient with themselves", async () => {
    const admin = await staff("admin");
    const sleepDoc = await doctor("sleep_medicine");
    const ent = await doctor("ent");
    const patientId = await patient(sleepDoc.practitionerId);
    await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });

    const own = await request(app).post("/api/v1/appointments").set("Authorization", ent.login.auth).send({ patient_id: patientId, start_at: futureSlot() });
    expect(own.status).toBe(201);
    expect(own.body.practitioner_id).toBe(ent.practitionerId);
  });

  describe("cancelling the visit that added the HCP (D2)", () => {
    it("drops them when it was their only visit and they recorded nothing", async () => {
      const admin = await staff("admin");
      const sleepDoc = await doctor("sleep_medicine");
      const ent = await doctor("ent");
      const patientId = await patient(sleepDoc.practitionerId);
      const booked = await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });

      const cancel = await request(app).patch(`/api/v1/appointments/${booked.body.id}`).set("Authorization", admin.auth).send({ status: "cancelled" });
      expect(cancel.status).toBe(200);
      expect(await teamRows(patientId)).toEqual([]);
      expect(await canOpen(ent, patientId)).toBe(404);
    });

    it("keeps them while another visit with the patient is still live", async () => {
      const admin = await staff("admin");
      const sleepDoc = await doctor("sleep_medicine");
      const ent = await doctor("ent");
      const patientId = await patient(sleepDoc.practitionerId);
      const first = await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });
      await book(admin.auth, patientId, ent.practitionerId);

      await request(app).patch(`/api/v1/appointments/${first.body.id}`).set("Authorization", admin.auth).send({ status: "cancelled" });
      expect((await teamRows(patientId)).map((r) => r.practitioner_id)).toEqual([ent.practitionerId]);
    });

    it("keeps them once they recorded something for the patient", async () => {
      const admin = await staff("admin");
      const sleepDoc = await doctor("sleep_medicine");
      const ent = await doctor("ent");
      const patientId = await patient(sleepDoc.practitionerId);
      const booked = await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });
      await withTenant(TENANT_SLUG, (client) =>
        insertAuditLog(client, { user_id: ent.login.id, action: "create", entity_type: "TreatmentPlan", entity_id: null, entity_after: { patient_id: patientId } })
      );

      await request(app).patch(`/api/v1/appointments/${booked.body.id}`).set("Authorization", admin.auth).send({ status: "cancelled" });
      expect(await canOpen(ent, patientId)).toBe(200);
    });

    it("an admin deleting the visit takes access back too", async () => {
      const admin = await staff("admin");
      const sleepDoc = await doctor("sleep_medicine");
      const ent = await doctor("ent");
      const patientId = await patient(sleepDoc.practitionerId);
      const booked = await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });

      const del = await request(app).delete(`/api/v1/appointments/${booked.body.id}`).set("Authorization", admin.auth);
      expect(del.status).toBe(200);
      expect(await teamRows(patientId)).toEqual([]);
    });
  });

  describe("managing the team by hand (D3)", () => {
    it("the field force adds but can't remove; a manager removes; a doctor does neither", async () => {
      const rep = await staff("rep");
      const manager = await staff("manager");
      const sleepDoc = await doctor("sleep_medicine");
      const dentist = await doctor("dentist");
      const patientId = await patient(sleepDoc.practitionerId);

      const byDoctor = await request(app).post(`/api/v1/patient/${patientId}/care-team`).set("Authorization", sleepDoc.login.auth).send({ practitioner_id: dentist.practitionerId });
      expect(byDoctor.status).toBe(403);

      const added = await request(app).post(`/api/v1/patient/${patientId}/care-team`).set("Authorization", rep.auth).send({ practitioner_id: dentist.practitionerId });
      expect(added.status).toBe(201);
      expect(await teamRows(patientId)).toEqual([{ practitioner_id: dentist.practitionerId, source: "manual", appointment_id: null }]);

      const repRemove = await request(app).delete(`/api/v1/patient/${patientId}/care-team/${dentist.practitionerId}`).set("Authorization", rep.auth);
      expect(repRemove.status).toBe(403);

      const primaryRemove = await request(app).delete(`/api/v1/patient/${patientId}/care-team/${sleepDoc.practitionerId}`).set("Authorization", manager.auth);
      expect(primaryRemove.status).toBe(400);

      const removed = await request(app).delete(`/api/v1/patient/${patientId}/care-team/${dentist.practitionerId}`).set("Authorization", manager.auth);
      expect(removed.status).toBe(200);
      expect(await canOpen(dentist, patientId)).toBe(404);
    });

    it("lists the primary doctor first, then members with specialty, how and by whom they were added", async () => {
      const admin = await staff("admin");
      const sleepDoc = await doctor("sleep_medicine");
      const ent = await doctor("ent");
      const patientId = await patient(sleepDoc.practitionerId);
      const booked = await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });

      const res = await request(app).get(`/api/v1/patient/${patientId}/care-team`).set("Authorization", ent.login.auth);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ practitioner_id: sleepDoc.practitionerId, primary: true, primary_specialty: "sleep_medicine", source: null });
      expect(res.body[1]).toMatchObject({ practitioner_id: ent.practitionerId, primary: false, primary_specialty: "ent", source: "appointment", appointment_id: booked.body.id, added_by_name: "QA Pilot" });
      expect(res.body[1].added_at).toEqual(expect.any(String));
    });
  });

  describe("primary doctor (D5)", () => {
    it("only an admin replaces it; the previous primary stays on the team", async () => {
      const admin = await staff("admin");
      const manager = await staff("manager");
      const sleepDoc = await doctor("sleep_medicine");
      const dentist = await doctor("dentist");
      const patientId = await patient(sleepDoc.practitionerId);

      const byManager = await request(app).patch(`/api/v1/patient/${patientId}`).set("Authorization", manager.auth).send({ practitioner_id: dentist.practitionerId });
      expect(byManager.status).toBe(403);
      const unchanged = await request(app).patch(`/api/v1/patient/${patientId}`).set("Authorization", manager.auth).send({ practitioner_id: sleepDoc.practitionerId, ahi_baseline: 12 });
      expect(unchanged.status).toBe(200);

      const byAdmin = await request(app).patch(`/api/v1/patient/${patientId}`).set("Authorization", admin.auth).send({ practitioner_id: dentist.practitionerId });
      expect(byAdmin.status).toBe(200);
      expect(await teamRows(patientId)).toEqual([{ practitioner_id: sleepDoc.practitionerId, source: "former_primary", appointment_id: null }]);
      expect(await canOpen(sleepDoc, patientId)).toBe(200);
      expect(await canOpen(dentist, patientId)).toBe(200);
    });

    it("a team doctor editing the patient re-sends the primary unchanged without taking it over", async () => {
      const admin = await staff("admin");
      const sleepDoc = await doctor("sleep_medicine");
      const ent = await doctor("ent");
      const patientId = await patient(sleepDoc.practitionerId);
      await book(admin.auth, patientId, ent.practitionerId, { grant_access: true });

      const same = await request(app).patch(`/api/v1/patient/${patientId}`).set("Authorization", ent.login.auth).send({ practitioner_id: sleepDoc.practitionerId, ahi_baseline: 20 });
      expect(same.status).toBe(200);
      const takeOver = await request(app).patch(`/api/v1/patient/${patientId}`).set("Authorization", ent.login.auth).send({ practitioner_id: null });
      expect(takeOver.status).toBe(403);
      expect((await request(app).get(`/api/v1/patient/${patientId}`).set("Authorization", admin.auth)).body.practitioner_id).toBe(sleepDoc.practitionerId);
    });
  });
});
