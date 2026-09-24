import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ValidationError } from "../errors.js";
import {
  CreateQuestionnaireRequestCommand,
  CancelQuestionnaireRequestCommand,
  GetPublicQuestionnaireQuery,
  SubmitPublicQuestionnaireCommand,
  QuestionnaireLinkInvalidError,
  PATIENT_CONSENT_VERSION,
} from "./questionnaireRequest.js";
import { ListClinicalRecordsQuery } from "../queries/clinicalRecords.js";
import { MEDICAL_HISTORY_QUESTIONS } from "./clinicalRecordFields.js";

/** Patient self-fill via QR — real Postgres end to end (CLAUDE.md: no DB mocks). */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const ORIGIN = "https://pwa-dev.example.test";
type Client = TenantContext["client"];

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildContext(client: Client): Promise<TenantContext> {
  const email = `qa-questionnaire-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "QA", "Doctor", "admin", hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

const tokenOf = (url: string) => url.split("#")[1]!;
const META = { ip: "203.0.113.7", userAgent: "vitest", requestId: "req-test" };
const ALL_NO = Object.fromEntries(MEDICAL_HISTORY_QUESTIONS.map((q) => [q, false]));

describe("patient self-fill questionnaire (QR link)", () => {
  it("full flow: link → public page shows first name only → submit → record appears as patient-sourced, link burnt", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Lucía", last_name: `Secreto-${uniqueSuffix()}` });

      const { request, url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, "medical_history", ORIGIN);
      expect(url).toMatch(new RegExp(`^${ORIGIN}/q#[A-Za-z0-9_-]{43}$`));
      expect(request.status).toBe("pending");
      expect(request.expires_at.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);

      const publicView = await GetPublicQuestionnaireQuery(client, tokenOf(url));
      expect(publicView).toMatchObject({ kind: "medical_history", patient_first_name: "Lucía" });
      expect(JSON.stringify(publicView)).not.toContain("Secreto");

      const pendingBefore = await ListClinicalRecordsQuery(ctx, patient.id);
      expect(pendingBefore.pending_requests.map((r) => r.id)).toEqual([request.id]);

      await SubmitPublicQuestionnaireCommand(client, tokenOf(url), { consent: true, answers: { ...ALL_NO, has_diabetes: true } }, META);

      const after = await ListClinicalRecordsQuery(ctx, patient.id);
      expect(after.pending_requests).toEqual([]);
      const record = after.records.find((r) => r.kind === "medical_history");
      expect(record).toMatchObject({ source: "patient", recorded_by: null, request_id: request.id, has_diabetes: true });
      expect(record && "consent_accepted_at" in record && record.consent_accepted_at).toBeInstanceOf(Date);
      const { rows } = await client.query(`SELECT consent_version FROM medical_history_questionnaire WHERE id = $1`, [record!.id]);
      expect(rows[0].consent_version).toBe(PATIENT_CONSENT_VERSION);

      const audit = await getAuditLogForEntities(client, ["MedicalHistoryQuestionnaire"], [record!.id]);
      expect(audit[0]).toMatchObject({ action: "create", user_id: null });

      // Single use: the same link is now dead, for reading and for submitting.
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(url))).rejects.toThrow(QuestionnaireLinkInvalidError);
      await expect(
        SubmitPublicQuestionnaireCommand(client, tokenOf(url), { consent: true, answers: ALL_NO }, META)
      ).rejects.toThrow(QuestionnaireLinkInvalidError);
    });
  }, 20000);

  it("patient must answer every medical-history question and accept consent", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Incompleta-${uniqueSuffix()}` });
      const { url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, "medical_history", ORIGIN);

      await expect(
        SubmitPublicQuestionnaireCommand(client, tokenOf(url), { consent: true, answers: { has_diabetes: true } }, META)
      ).rejects.toThrow(ValidationError);
      await expect(
        SubmitPublicQuestionnaireCommand(client, tokenOf(url), { consent: false, answers: ALL_NO }, META)
      ).rejects.toThrow(ValidationError);
    });
  });

  it("STOP-Bang via QR stores only S-T-O-P — B-A-N-G sent by the patient is ignored, score stays NULL for the doctor", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `StopBang-${uniqueSuffix()}` });
      const { url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, "stop_bang", ORIGIN);

      await SubmitPublicQuestionnaireCommand(
        client,
        tokenOf(url),
        { consent: true, answers: { snoring: true, tiredness: true, observed_apnea: false, pressure: true, is_male: true, bmi_over_35: true } },
        META
      );
      const { records } = await ListClinicalRecordsQuery(ctx, patient.id);
      expect(records[0]).toMatchObject({ kind: "stop_bang", source: "patient", snoring: true, is_male: null, bmi_over_35: null, score: null });
    });
  });

  it("issuing a new link retires the previous one; cancelled, expired and malformed links are all rejected identically", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Links-${uniqueSuffix()}` });

      const first = await CreateQuestionnaireRequestCommand(ctx, patient.id, "medical_history", ORIGIN);
      const second = await CreateQuestionnaireRequestCommand(ctx, patient.id, "medical_history", ORIGIN);
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(first.url))).rejects.toThrow(QuestionnaireLinkInvalidError);
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(second.url))).resolves.toBeTruthy();

      await CancelQuestionnaireRequestCommand(ctx, patient.id, second.request.id);
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(second.url))).rejects.toThrow(QuestionnaireLinkInvalidError);

      const third = await CreateQuestionnaireRequestCommand(ctx, patient.id, "medical_history", ORIGIN);
      await client.query(`UPDATE questionnaire_request SET expires_at = now() - interval '1 minute' WHERE id = $1`, [third.request.id]);
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(third.url))).rejects.toThrow(QuestionnaireLinkInvalidError);

      await expect(GetPublicQuestionnaireQuery(client, "not-a-token")).rejects.toThrow(QuestionnaireLinkInvalidError);
    });
  });

  it("only medical history and STOP-Bang can be sent to the patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Kind-${uniqueSuffix()}` });
      await expect(CreateQuestionnaireRequestCommand(ctx, patient.id, "oral_exam", ORIGIN)).rejects.toThrow(ValidationError);
    });
  });
});
