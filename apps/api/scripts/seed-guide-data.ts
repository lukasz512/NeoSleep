/**
 * Seeds the demo doctor + "Tester Patient N" records the doctor user guide's
 * screenshots are taken from (docs/user-guide/, run by `pnpm guide:build`).
 *
 *   pnpm --filter @neo/api seed:guide
 *
 * Local databases only: it refuses any DATABASE_URL that isn't localhost, so
 * it can never write fake patients into dev or prod. Re-running is a no-op
 * once the doctor exists (start from a fresh container to change the data).
 */
import bcrypt from "bcrypt";
import {
  withTenant, insertStaffUser, insertPatient, insertPractitioner, insertSleepStudy,
  insertTreatmentPlan, insertAppointment,
} from "../src/db.js";
import { setDoctorPanelEnabled } from "../src/db/config.js";

export const GUIDE_DOCTOR_EMAIL = "dra.demo@neosleepcare.local";
export const GUIDE_DOCTOR_PASSWORD = "guia-local-only-password";

const DAY = 86_400_000;

/** Mexico City is UTC-6 all year (no DST since 2022) — the guide is shot in that timezone. */
const MX_UTC_OFFSET_HOURS = 6;

/** Today at hh:mm Mexico City time, shifted by `days`. */
function at(days: number, hh: number, mm = 0): Date {
  const d = new Date(Date.now() - MX_UTC_OFFSET_HOURS * 3_600_000 + days * DAY);
  d.setUTCHours(hh + MX_UTC_OFFSET_HOURS, mm, 0, 0);
  return d;
}

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`seed-guide-data only runs against a local database (DATABASE_URL host is "${host || "unset"}")`);
  }
}

async function seed(): Promise<void> {
  assertLocalDatabase();
  const slug = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
  await withTenant(slug, async (client) => {
    const existing = await client.query(`SELECT 1 FROM identities WHERE email = $1`, [GUIDE_DOCTOR_EMAIL]);
    if (existing.rowCount) {
      console.log("[seed-guide-data] already seeded, nothing to do");
      return;
    }

    const practitioner = await insertPractitioner(client, { first_name: "Lorena", last_name: "Demo", email: GUIDE_DOCTOR_EMAIL });
    const hash = await bcrypt.hash(GUIDE_DOCTOR_PASSWORD, 4);
    const user = await insertStaffUser(client, GUIDE_DOCTOR_EMAIL, "Lorena", "Demo", "doctor", hash, false, "Dra.", null, null, null, "MX");
    if (!user) throw new Error("doctor user was not created");

    const patient = (n: number, gender: "female" | "male", dob: string) =>
      insertPatient(client, {
        first_name: "Tester", last_name: `Patient ${n}`, gender, date_of_birth: dob,
        email: `tester.patient${n}@example.com`, phone: `55 1234 56${String(n).padStart(2, "0")}`,
        country_code: "MX", practitioner_id: practitioner.id,
      });
    const visit = (patientId: string, start: Date, minutes = 60, notes: string | null = null) =>
      insertAppointment(client, {
        patient_id: patientId, practitioner_id: practitioner.id, organization_id: null, territory_id: null,
        created_by_user_id: user.id, start_at: start.toISOString(),
        end_at: new Date(start.getTime() + minutes * 60_000).toISOString(), timezone: "America/Mexico_City", notes,
      });

    // 1 — new patient: first visit booked, nothing else yet.
    const p1 = await patient(1, "female", "1979-04-12");
    await visit(p1.id, at(0, 10));

    // 2 — study results arrived, waiting for the doctor's interpretation.
    const p2 = await patient(2, "male", "1968-09-30");
    await insertSleepStudy(client, {
      patient_id: p2.id, study_type: "polysomnography", status: "results_received",
      study_date: at(-6, 22).toISOString().slice(0, 10), results_received_at: at(-1, 9).toISOString(),
      ahi_score: 22.4, spo2_nadir: 84, odi: 19.8,
    });
    await visit(p2.id, at(0, 12, 30), 45);

    // 3 — interpreted study, device order in production (tracking screen).
    const p3 = await patient(3, "female", "1985-01-22");
    const s3 = await insertSleepStudy(client, {
      patient_id: p3.id, study_type: "polysomnography", status: "interpreted",
      study_date: at(-30, 22).toISOString().slice(0, 10), results_received_at: at(-25, 9).toISOString(),
      ahi_score: 17.1, spo2_nadir: 87, odi: 14.2, interpreted_by: practitioner.id, interpreted_at: at(-24, 11).toISOString(),
      interpretation: "SAOS moderado. Indicado dispositivo de avance mandibular.", oa_indicated: true,
    });
    const plan = await insertTreatmentPlan(client, { patient_id: p3.id, sleep_study_id: s3.id, type: "dental_appliance", status: "in_progress" });
    await client.query(`UPDATE treatment_plan SET appliance_ordered_at = $2 WHERE id = $1`, [plan.id, at(-10, 13).toISOString()]);
    // The order number shown on the plan card comes from its partner link (TREATMENT_PLAN_JOIN).
    await client.query(
      `INSERT INTO partner_link (partner, entity_type, entity_id, external_id, external_status, sync_status, last_synced_at, created_at)
       VALUES ('orthoapnea', 'treatment_plan', $1, '100245', 'in_production', 'synced', now(), $2)`,
      [plan.id, at(-10, 13).toISOString()],
    );
    await visit(p3.id, at(2, 9, 30), 30);

    // 4 — a follow-up later this week.
    const p4 = await patient(4, "male", "1972-06-05");
    await visit(p4.id, at(3, 16), 30);
  });
  await setDoctorPanelEnabled(true);
}

seed()
  .then(() => {
    console.log(`[seed-guide-data] ready: ${GUIDE_DOCTOR_EMAIL}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed-guide-data] failed:", err);
    process.exit(1);
  });
