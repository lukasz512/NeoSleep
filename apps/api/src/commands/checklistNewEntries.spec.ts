import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import { insertMedicalHistory } from "../db/clinicalRecords.js";
import type { TenantContext } from "../context/TenantContext.js";
import { NotFoundError } from "../errors.js";
import { RecordClinicalQuestionnaireCommand } from "./clinicalRecords.js";
import { MEDICAL_HISTORY_QUESTIONS, type MedicalHistoryQuestion } from "./clinicalRecordFields.js";
import { CreateSleepStudyCommand } from "./sleepStudy.js";
import { OpenChecklistEntryCommand } from "./patientChecklist.js";
import {
  GetPatientChecklistQuery,
  annotateNewEntries,
  checklistVersion,
  allChecklistEntries,
  CHECKLIST_ENTRY_AUDIT_TYPE,
} from "../queries/patientChecklist.js";

/**
 * NEO-173 — the Estudios "Nuevo" marker and the change fingerprint the open
 * tab polls. Real Postgres: "opened" lives in audit_log, so it is the thing
 * under test, not something to mock.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
type Client = TenantContext["client"];

const uniqueSuffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function staff(client: Client, role: "doctor" | "manager" = "doctor"): Promise<TenantContext> {
  const email = `qa-nuevo-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "QA", "Staff", role, hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role, roles: [{ role, territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

/** What a patient who ticked nothing sends. */
const NO_ANSWERS = {
  ...(Object.fromEntries(MEDICAL_HISTORY_QUESTIONS.map((q) => [q, null])) as Record<MedicalHistoryQuestion, null>),
  medical_history_other: null,
};

const newPatient = (client: Client) => insertPatient(client, { first_name: "Ana", last_name: `Nuevo-${uniqueSuffix()}` });

async function newIds(ctx: TenantContext, patientId: string): Promise<string[]> {
  const checklist = await annotateNewEntries(ctx.client, await GetPatientChecklistQuery(ctx, patientId), ctx.user.id);
  return allChecklistEntries(checklist).filter((e) => e.is_new).map((e) => e.id);
}

async function auditRows(client: Client, patientId: string, entityType: string): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM audit_log WHERE entity_type = $1 AND action = 'read' AND metadata->>'patient_id' = $2`,
    [entityType, patientId]
  );
  return Number(r.rows[0]!.n);
}

describe("annotateNewEntries (NEO-173)", () => {
  it("a result someone else added is new for me, never for its author; opening it clears it for me only", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const author = await staff(client);
      const me = await staff(client);
      const colleague = await staff(client, "manager");
      const patient = await newPatient(client);
      const record = await RecordClinicalQuestionnaireCommand(author, patient.id, "oral_exam", { has_bruxism: true });

      expect(await newIds(author, patient.id)).toEqual([]);
      expect(await newIds(me, patient.id)).toEqual([record.id]);

      await OpenChecklistEntryCommand(me, patient.id, record.id);
      expect(await newIds(me, patient.id)).toEqual([]);
      expect(await newIds(colleague, patient.id)).toEqual([record.id]);
      expect(await auditRows(client, patient.id, CHECKLIST_ENTRY_AUDIT_TYPE)).toBe(1);
    });
  }, 20000);

  it("what the patient filled via QR is new for every staff member", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const me = await staff(client);
      const patient = await newPatient(client);
      const record = await insertMedicalHistory(client, { patient_id: patient.id, recorded_by: null, source: "patient", request_id: null, consent: null }, NO_ANSWERS);

      expect(await newIds(me, patient.id)).toEqual([record.id]);
    });
  }, 20000);

  it("a sleep study counts as mine when I created it (from its create audit row), even with an old study date", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const author = await staff(client);
      const me = await staff(client);
      const patient = await newPatient(client);
      const study = await CreateSleepStudyCommand(author, { patient_id: patient.id, study_date: "2025-01-15" });

      expect(await newIds(author, patient.id)).toEqual([]);
      expect(await newIds(me, patient.id)).toEqual([study.id]);
    });
  }, 20000);

  it("results entered before the rollout cut-off are never new", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const author = await staff(client);
      const me = await staff(client);
      const patient = await newPatient(client);
      const record = await RecordClinicalQuestionnaireCommand(author, patient.id, "oral_exam", { has_bruxism: false });
      await client.query(`UPDATE oral_exam SET created_at = '2026-09-01T10:00:00Z' WHERE id = $1`, [record.id]);

      expect(await newIds(me, patient.id)).toEqual([]);
    });
  }, 20000);
});

describe("OpenChecklistEntryCommand (NEO-173)", () => {
  it("refuses an entry that is not this patient's", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const me = await staff(client);
      const patient = await newPatient(client);
      const other = await newPatient(client);
      const record = await RecordClinicalQuestionnaireCommand(me, other.id, "oral_exam", { has_bruxism: true });

      await expect(OpenChecklistEntryCommand(me, patient.id, record.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  }, 20000);
});

describe("checklistVersion (NEO-173)", () => {
  it("stays the same until something changes — opening a result does not change it — and moves when a result arrives", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const me = await staff(client);
      const patient = await newPatient(client);
      const first = await RecordClinicalQuestionnaireCommand(me, patient.id, "oral_exam", { has_bruxism: true });
      const v1 = checklistVersion(await GetPatientChecklistQuery(me, patient.id));

      expect(checklistVersion(await GetPatientChecklistQuery(me, patient.id))).toBe(v1);
      await OpenChecklistEntryCommand(me, patient.id, first.id);
      expect(checklistVersion(await GetPatientChecklistQuery(me, patient.id))).toBe(v1);

      await insertMedicalHistory(client, { patient_id: patient.id, recorded_by: null, source: "patient", request_id: null, consent: null }, NO_ANSWERS);
      expect(checklistVersion(await GetPatientChecklistQuery(me, patient.id))).not.toBe(v1);
    });
  }, 20000);
});
