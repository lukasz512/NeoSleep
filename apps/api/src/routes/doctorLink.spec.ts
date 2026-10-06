import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser, insertPractitioner, insertPatient, isUserLinkedToPractitioner, getStaffUserByEmail, getUserIdByEmail } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import { DOCTOR_NOT_LINKED_PREFIX, reportUnlinkedDoctor, resetDoctorLinkAlertThrottle } from "../services/doctorLinkAlert.js";

/**
 * CORE-173: Dra. Lorena's login and her practitioner record sat on two
 * identities ("Lorena@…" vs "lorena@…"), so every list answered 403 and she
 * saw an empty app. Real Postgres, real Express stack.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function openAutoReports(userId: string): Promise<number> {
  const { rows } = await getDb().query<{ n: string }>(
    `SELECT count(*) AS n FROM platform.problem_report
      WHERE tenant_slug = $1 AND reporter_user_id = $2 AND status = 'new' AND left(description, length($3)) = $3`,
    [TENANT_SLUG, userId, DOCTOR_NOT_LINKED_PREFIX]
  );
  return Number(rows[0]!.n);
}

/** A doctor login with no practitioner on its identity. */
async function unlinkedDoctor(): Promise<{ userId: string; email: string; auth: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-core173-unlinked-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant", 4);
    const user = await insertStaffUser(client, email, "Lone", "Doctor", "doctor", hash, false);
    return { userId: user!.id, email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "doctor", token_version: 0 })}` };
  });
}

beforeEach(() => resetDoctorLinkAlertThrottle());

describe("CORE-173 one identity per doctor, whatever the email's case", () => {
  it("a practitioner typed with capitals and its lowercased login share one identity", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const local = `qa-core173-${uniqueSuffix()}`;
      const practitioner = await insertPractitioner(client, { first_name: "Lorena", last_name: "Case", email: `  ${local.toUpperCase()}@NeoSleepCare.com ` });
      const user = await insertStaffUser(client, `${local}@neosleepcare.com`, "Lorena", "Case", "doctor", null, true);
      expect(practitioner.email).toBe(`${local}@neosleepcare.com`);
      expect(await isUserLinkedToPractitioner(client, user!.id, practitioner.id)).toBe(true);
    });
  });
});

describe("CORE-173 login email separate from the contact email", () => {
  it("signs in with users.login_email while the identity keeps the contact email", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const contact = `qa-core173-contact-${uniqueSuffix()}@gmail.example`;
      const login = `QA-core173-work-${uniqueSuffix()}@NeoSleepCare.com`;
      const user = await insertStaffUser(client, contact, "Lorena", "Login", "doctor", null, true);
      await client.query(`UPDATE users SET login_email = $1 WHERE id = $2`, [login, user!.id]);
      expect((await getStaffUserByEmail(client, login))?.id).toBe(user!.id);
      expect(await getUserIdByEmail(client, login)).toBe(user!.id);
      expect((await getStaffUserByEmail(client, contact))?.id).toBe(user!.id);
    });
  });
});

describe("CORE-173 unlinked doctor → clear 403 + automatic admin report", () => {
  it("answers 403 DOCTOR_NOT_LINKED and files one admin report", async () => {
    const doc = await unlinkedDoctor();
    const res = await request(app).get("/api/v1/patient").set("Authorization", doc.auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DOCTOR_NOT_LINKED");

    // The report is filed after the response (best effort) — wait for it.
    for (let i = 0; i < 50 && (await openAutoReports(doc.userId)) === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(await openAutoReports(doc.userId)).toBe(1);
  });

  it("files only one open report per doctor, however often they try", async () => {
    const doc = await unlinkedDoctor();
    const input = { tenantSlug: TENANT_SLUG, userId: doc.userId, email: doc.email, name: "Lone Doctor", requestId: "req-1" };
    await reportUnlinkedDoctor(input);
    resetDoctorLinkAlertThrottle();
    await reportUnlinkedDoctor(input);
    await reportUnlinkedDoctor(input);
    expect(await openAutoReports(doc.userId)).toBe(1);
  });
});

describe("CORE-173 migration 056 relinks split doctors", () => {
  it("moves the login onto the practitioner's identity and audits it", async () => {
    const local = `qa-core173-split-${uniqueSuffix()}`;
    const { userId, practitionerId, patientId } = await withTenant(TENANT_SLUG, async (client) => {
      // Legacy state: the practitioner identity was stored with capitals (pre-fix writer).
      const practitioner = await insertPractitioner(client, { first_name: "Split", last_name: "Doc", email: `${local}@other.example` });
      await client.query(`UPDATE identities SET email = $1 WHERE id = $2`, [`${local.toUpperCase()}@NeoSleepCare.com`, practitioner.identity_id]);
      const user = await insertStaffUser(client, `${local}@neosleepcare.com`, "Split", "Doc", "doctor", null, true);
      expect(await isUserLinkedToPractitioner(client, user!.id, practitioner.id)).toBe(false);
      const patient = await insertPatient(client, { first_name: "Her", last_name: `Patient-${uniqueSuffix()}`, practitioner_id: practitioner.id });
      return { userId: user!.id, practitionerId: practitioner.id, patientId: patient.id };
    });

    // Migration 056 ran on every tenant at startup; the test schema isn't one, so run its repair here.
    await getDb().query("SELECT public.relink_doctor_logins($1)", [TENANT_SLUG]);

    await withTenant(TENANT_SLUG, async (client) => {
      expect(await isUserLinkedToPractitioner(client, userId, practitionerId)).toBe(true);
      const audit = await client.query(
        `SELECT 1 FROM audit_log WHERE entity_type = 'User' AND entity_id = $1 AND metadata->>'migration' = '056'`,
        [userId]
      );
      expect(audit.rowCount).toBe(1);
      const email = await client.query<{ email: string }>(
        `SELECT i.email FROM practitioner p JOIN identities i ON i.id = p.identity_id WHERE p.id = $1`,
        [practitionerId]
      );
      expect(email.rows[0]!.email).toBe(`${local}@neosleepcare.com`);
    });

    const auth = `Bearer ${signAuthToken({ id: userId, email: `${local}@neosleepcare.com`, role: "doctor", token_version: 0 })}`;
    const res = await request(app).get("/api/v1/patient?limit=500").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect((res.body.items as { id: string }[]).map((p) => p.id)).toContain(patientId);
  });
});
