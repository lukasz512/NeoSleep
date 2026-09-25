import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { insertMedicalHistory, insertOralExam, insertStopBang } from "./clinicalRecords.js";
import { insertConsent } from "./consent.js";
import { insertFileAttachment } from "./fileAttachment.js";
import { insertSleepStudy } from "./sleepStudy.js";
import { getPatientFormCompletion, POLYSOMNOGRAPHY_FORM_KEY, type FormCompletionItem } from "./patientFormCompletion.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";
import { MEDICAL_HISTORY_QUESTIONS, ORAL_EXAM_QUESTIONS, STOP_QUESTIONS, BANG_QUESTIONS } from "../commands/clinicalRecordFields.js";

/**
 * The patient list's intake-form dots (NEO-54) and the patient's Estudios
 * checklist (NEO-36, ADR-024) must never disagree about what's done: one
 * batched SQL query for the list, the checklist's own rules for the tab.
 * Real Postgres (CLAUDE.md: no DB mocks).
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
type Client = TenantContext["client"];

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildContext(client: Client): Promise<TenantContext> {
  const email = `qa-forms-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "QA", "Doctor", "admin", hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

const meta = (patientId: string) => ({ patient_id: patientId, source: "staff" as const, recorded_by: null, request_id: null, consent: null });
const all = <K extends string>(keys: readonly K[], value: boolean | null) => Object.fromEntries(keys.map((k) => [k, value])) as Record<K, boolean | null>;
const STOP_YES = all(STOP_QUESTIONS, true) as Record<(typeof STOP_QUESTIONS)[number], boolean>;

const ITEMS: FormCompletionItem[] = [
  { key: "informedConsent", fillMode: "consent" },
  { key: "medicalHistory", fillMode: "patient" },
  { key: "stopBang", fillMode: "patient" },
  { key: "oralExam", fillMode: "doctor" },
  { key: "historiaEndo", fillMode: "doctor" },
  { key: POLYSOMNOGRAPHY_FORM_KEY, fillMode: null },
];

function upload(client: Client, patientId: string, item: string | null) {
  return insertFileAttachment(client, {
    entity_type: "patient",
    entity_id: patientId,
    url: `patient/${patientId}/scan.pdf`,
    filename: "scan.pdf",
    metadata: { document_type: "study_upload", title: "Scan", notes: null, checklist_item: item },
  });
}

describe("getPatientFormCompletion — the patient list's dots", () => {
  it("agrees with the Estudios checklist item by item, for every kind of record", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = (label: string) => insertPatient(client, { first_name: "Forms", last_name: `${label}-${uniqueSuffix()}` });

      const empty = await patient("Empty");

      const records = await patient("Records");
      await insertConsent(client, { entity_type: "patient", entity_id: records.id, legal_basis: "consent", jurisdiction: "MX", purpose: "informedConsent" });
      await insertMedicalHistory(client, meta(records.id), { ...all(MEDICAL_HISTORY_QUESTIONS, false), medical_history_other: null });
      await insertStopBang(client, meta(records.id), STOP_YES, all(BANG_QUESTIONS, false));
      await insertOralExam(client, meta(records.id), { ...all(ORAL_EXAM_QUESTIONS, false), skeletal_class: "II", tooth: null });
      await upload(client, records.id, "historiaEndo");
      await insertSleepStudy(client, { patient_id: records.id, status: "interpreted", study_type: "polysomnography" });

      // Not done: S-T-O-P only, a withdrawn consent, a study only ordered, a non-PSG study, a file for another item.
      const partial = await patient("Partial");
      const withdrawn = await insertConsent(client, { entity_type: "patient", entity_id: partial.id, legal_basis: "consent", jurisdiction: "MX", purpose: "informedConsent" });
      await client.query(`UPDATE consent SET withdrawn_at = now() WHERE id = $1`, [withdrawn]);
      await insertStopBang(client, meta(partial.id), STOP_YES, all(BANG_QUESTIONS, null));
      await insertSleepStudy(client, { patient_id: partial.id, status: "ordered", study_type: "polysomnography" });
      await insertSleepStudy(client, { patient_id: partial.id, status: "interpreted", study_type: "other" });
      await upload(client, partial.id, null);

      // Done by attached files alone (a scanned consent, an external PSG report).
      const files = await patient("Files");
      await upload(client, files.id, "informedConsent");
      await upload(client, files.id, POLYSOMNOGRAPHY_FORM_KEY);

      const patients = [empty, records, partial, files];
      const completion = await getPatientFormCompletion(client, patients.map((p) => p.id), ITEMS);

      for (const p of patients) {
        const checklist = await GetPatientChecklistQuery(ctx, p.id);
        const fromChecklist = checklist.items.filter((i) => i.status === "done").map((i) => i.key).sort();
        expect([...(completion.get(p.id) ?? [])].sort(), p.last_name).toEqual(fromChecklist);
      }

      expect([...(completion.get(empty.id) ?? [])]).toEqual([]);
      expect([...(completion.get(records.id) ?? [])].sort()).toEqual(
        ["historiaEndo", "informedConsent", "medicalHistory", "oralExam", POLYSOMNOGRAPHY_FORM_KEY, "stopBang"].sort()
      );
      expect([...(completion.get(partial.id) ?? [])]).toEqual([]);
      expect([...(completion.get(files.id) ?? [])].sort()).toEqual(["informedConsent", POLYSOMNOGRAPHY_FORM_KEY]);
    });
  }, 30000);

  it("STOP-Bang: the latest entry decides (a newer S-T-O-P-only screening reopens it)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const p = await insertPatient(client, { first_name: "Forms", last_name: `Latest-${uniqueSuffix()}` });
      await insertStopBang(client, meta(p.id), STOP_YES, all(BANG_QUESTIONS, false));
      await client.query(`UPDATE stop_bang_screening SET created_at = now() - interval '1 day' WHERE patient_id = $1`, [p.id]);
      await insertStopBang(client, meta(p.id), STOP_YES, all(BANG_QUESTIONS, null));
      const completion = await getPatientFormCompletion(client, [p.id], [{ key: "stopBang", fillMode: "patient" }]);
      expect(completion.get(p.id)?.has("stopBang")).toBe(false);
    });
  }, 15000);

  it("only checks the requested items, and handles an empty page", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const p = await insertPatient(client, { first_name: "Forms", last_name: `Scoped-${uniqueSuffix()}` });
      await insertMedicalHistory(client, meta(p.id), { ...all(MEDICAL_HISTORY_QUESTIONS, false), medical_history_other: null });
      const scoped = await getPatientFormCompletion(client, [p.id], [{ key: "oralExam", fillMode: "doctor" }]);
      expect(scoped.get(p.id)?.size).toBe(0);
      expect((await getPatientFormCompletion(client, [], ITEMS)).size).toBe(0);
    });
  }, 15000);
});
