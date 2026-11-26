import bcrypt from "bcrypt";
import type { DeviceOrder } from "@neo/device-order";
import { withTenant, insertStaffUser, getGlobalTerritoryId } from "../../src/db.js";
import type { TenantContext } from "../../src/context/TenantContext.js";
import { CreatePatientCommand } from "../../src/commands/patient.js";
import { CreatePractitionerCommand } from "../../src/commands/practitioner.js";
import { CreateSleepStudyCommand } from "../../src/commands/sleepStudy.js";
import { CreateTreatmentPlanCommand } from "../../src/commands/treatmentPlan.js";
import { signAuthToken } from "../../src/utils/jwt.js";

/** Shared setup for the device-order route specs (deviceOrders.spec.ts, reconciliation.spec.ts). */
export const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** What a complete HCO looks like; individual tests blank fields out. */
export const COMPLETE_HCO = {
  address_line1: "Calle de Prueba 1, Col. Juarez",
  city: "Ciudad de Mexico",
  postal_code: "06600",
  country_code: "MX",
  phone: "+520000000000",
  email: "qa-clinic@example.com",
};

export interface Setup {
  token: string;
  userId: string;
  patientId: string;
  planId: string;
  dentistId: string;
}

/** One committed transaction: an admin user, a dentist with a primary HCO, a patient, a study and a dental-appliance plan. */
export async function setup(
  hco: Partial<typeof COMPLETE_HCO> | null = COMPLETE_HCO,
  role: "admin" | "manager" | "rep" = "admin",
  patientOverrides: Partial<Parameters<typeof CreatePatientCommand>[1]> = {}
): Promise<Setup> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-device-order-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
    const ctx: TenantContext = {
      slug: TENANT_SLUG,
      client,
      user: { id: user!.id, email, role, roles: [{ role, territory_id: await getGlobalTerritoryId(client) }] },
      requestId: `test-${uniqueSuffix()}`,
    };
    const patient = await CreatePatientCommand(ctx, {
      gender: "male",
      date_of_birth: "1975-06-15",
      first_name: "Tester",
      last_name: `Patient-${uniqueSuffix()}`,
      email: `qa-patient-${uniqueSuffix()}@example.com`,
      phone: "600100200",
      region: "MX",
      ...patientOverrides,
    });
    const dentist = await CreatePractitionerCommand(ctx, {
      first_name: "Test",
      last_name: `Dentist-${uniqueSuffix()}`,
      email: `qa-dentist-${uniqueSuffix()}@example.com`,
      phone: "600100200",
    });
    if (hco) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO organization (name, address_line1, city, postal_code, country_code, phone, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [`QA Clinic ${uniqueSuffix()}`, hco.address_line1 ?? null, hco.city ?? null, hco.postal_code ?? null, hco.country_code ?? null, hco.phone ?? null, hco.email ?? null]
      );
      await client.query(
        `INSERT INTO practitioner_organization (practitioner_id, organization_id, is_primary) VALUES ($1, $2, true)`,
        [dentist.id, rows[0]!.id]
      );
    }
    const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
    const plan = await CreateTreatmentPlanCommand(ctx, {
      patient_id: patient.id,
      sleep_study_id: study.id,
      type: "dental_appliance",
      dentist_id: dentist.id,
    });
    const token = signAuthToken({ id: user!.id, email, role, token_version: 0 });
    return { token, userId: user!.id, patientId: patient.id, planId: plan.id, dentistId: dentist.id };
  });
}

/** Affiliates one more (non-primary) clinic to the dentist; returns its organization id. */
export async function addClinic(dentistId: string, hco: Partial<typeof COMPLETE_HCO> = COMPLETE_HCO, name = `QA Clinic ${uniqueSuffix()}`): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO organization (name, address_line1, city, postal_code, country_code, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, hco.address_line1 ?? null, hco.city ?? null, hco.postal_code ?? null, hco.country_code ?? null, hco.phone ?? null, hco.email ?? null]
    );
    await client.query(
      `INSERT INTO practitioner_organization (practitioner_id, organization_id, is_primary) VALUES ($1, $2, false)`,
      [dentistId, rows[0]!.id]
    );
    return rows[0]!.id;
  });
}

/** A valid NOA order: standard sequence, desired date well past OA's manufacturing date. */
export function validOrder(dentistId: string, overrides: Partial<DeviceOrder> = {}): DeviceOrder {
  return {
    dentistId,
    productCode: "002",
    retrusionMaxMm: -4,
    protrusionMaxMm: 6,
    startingPoint: { unit: "mm", value: 1 },
    sequence: { type: "standard" },
    deviation: { rightMm: 0, rightAdvanceMm: 0, leftMm: 0, leftAdvanceMm: 0 },
    morningAligner: false,
    verticalDimension: { kind: "registro" },
    anteriorFrontalOpening: false,
    slotsForElasticBands: false,
    laterality: 3,
    limitOpening: 7,
    upperBand: 3,
    lowerBand: 3,
    finish: "mixed",
    teeth: { "16": "crown" },
    observations: "QA replica order",
    desiredDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
    noContactDoctorForRedesign: false,
    registration: { method: "impression" },
    acknowledgedWarnings: [],
    ...overrides,
  };
}

/**
 * A doctor login for the setup's dentist: same email, so the user shares the
 * practitioner's identity (ADR-014). The patient becomes the doctor's own, so
 * the doctor may order for them. Returns the doctor's bearer token.
 */
export async function doctorLoginFor(s: Setup): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const { rows } = await client.query<{ email: string }>(
      `SELECT i.email FROM practitioner p JOIN identities i ON i.id = p.identity_id WHERE p.id = $1`,
      [s.dentistId]
    );
    const email = rows[0]!.email;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "Doc", "Test", "doctor", hash, false);
    await client.query(`UPDATE patient SET practitioner_id = $1 WHERE id = $2`, [s.dentistId, s.patientId]);
    return signAuthToken({ id: user!.id, email, role: "doctor", token_version: 0 });
  });
}
