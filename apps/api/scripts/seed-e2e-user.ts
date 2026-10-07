/**
 * Seeds the staff users and records the PWA's Playwright E2E suite (apps/pwa/e2e/)
 * works with — run by apps/pwa/e2e/global-setup.ts, which passes a fresh random
 * E2E_USER_PASSWORD each run. Local databases only (CORE-180, see
 * e2e-seed-guard.ts).
 *
 * - e2e-auth@ (rep): the auth specs.
 * - e2e-admin@ (admin) + one doctor + one patient on that doctor's care team:
 *   the real-backend flow specs (CORE-181 data-flow.spec.ts) book visits on them.
 *
 * Idempotent: users and records are created once (found again by email), and
 * the password hash is reset on every run so a new random password works
 * against a reused DB. The last line printed is `E2E_SEED {json}` with the ids
 * global-setup hands to the tests.
 */
import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { withTenant, insertStaffUser } from "../src/db.js";
import { insertPractitioner } from "../src/db/practitioner.js";
import { insertPatient } from "../src/db/patient.js";
import { assertLocalDatabase, requireE2EPassword } from "./e2e-seed-guard.js";

export const E2E_USER_EMAIL = "e2e-auth@neosleepcare.com";
export const E2E_ADMIN_EMAIL = "e2e-admin@neosleepcare.com";
const E2E_DOCTOR_EMAIL = "e2e-doctor@neosleepcare.com";
const E2E_PATIENT_EMAIL = "e2e-patient@neosleepcare.com";
/** Synthetic values for the fields the patient edit form requires. */
const PATIENT_REQUIRED = { gender: "male", date_of_birth: "1980-05-01", phone: "+52 55 0000 0000" };

async function idByEmail(client: PoolClient, table: "practitioner" | "patient", email: string): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT t.id FROM ${table} t JOIN identities i ON i.id = t.identity_id WHERE lower(i.email) = $1 LIMIT 1`,
    [email],
  );
  return res.rows[0]?.id ?? null;
}

async function seed(): Promise<void> {
  assertLocalDatabase(process.env.DATABASE_URL);
  const password = requireE2EPassword(process.env.E2E_USER_PASSWORD);
  const slug = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
  const hash = await bcrypt.hash(password, 4);
  const ids = await withTenant(slug, async (client) => {
    await insertStaffUser(client, E2E_USER_EMAIL, "E2E", "Auth", "rep", hash, false);
    await insertStaffUser(client, E2E_ADMIN_EMAIL, "E2E", "Admin", "admin", hash, false);
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = now()
       FROM identities WHERE users.identity_id = identities.id AND identities.email = ANY($2)`,
      [hash, [E2E_USER_EMAIL, E2E_ADMIN_EMAIL]],
    );
    const practitionerId =
      (await idByEmail(client, "practitioner", E2E_DOCTOR_EMAIL)) ??
      (await insertPractitioner(client, { first_name: "Eva", last_name: "E2E Doctor", email: E2E_DOCTOR_EMAIL, status: "active" })).id;
    const patientId =
      (await idByEmail(client, "patient", E2E_PATIENT_EMAIL)) ??
      (await insertPatient(client, { first_name: "Pablo", last_name: "E2E Patient", email: E2E_PATIENT_EMAIL, practitioner_id: practitionerId, ...PATIENT_REQUIRED })).id;
    // The edit form requires these; a record seeded before they were set gets them now.
    await client.query(
      `UPDATE identities SET gender = $2, date_of_birth = $3, phone = $4 FROM patient WHERE patient.identity_id = identities.id AND patient.id = $1`,
      [patientId, PATIENT_REQUIRED.gender, PATIENT_REQUIRED.date_of_birth, PATIENT_REQUIRED.phone],
    );
    // A reused local DB: earlier runs' visits are cancelled so the card starts with nothing booked.
    await client.query(`UPDATE appointment SET status = 'cancelled', updated_at = now() WHERE patient_id = $1 AND status = 'scheduled'`, [patientId]);
    return { practitionerId, patientId };
  });
  console.log(`E2E_SEED ${JSON.stringify(ids)}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-e2e-user] failed:", err);
    process.exit(1);
  });
