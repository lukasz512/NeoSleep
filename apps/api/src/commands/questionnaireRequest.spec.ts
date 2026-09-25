import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion } from "../db/documentContent.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ValidationError } from "../errors.js";
import {
  CreateQuestionnaireRequestCommand,
  CancelQuestionnaireRequestCommand,
  GetPublicQuestionnaireQuery,
  SubmitPublicQuestionnaireCommand,
  QuestionnaireLinkInvalidError,
  PATIENT_CONSENT_VERSION,
  type PublicRunner,
} from "./questionnaireRequest.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";
import { MEDICAL_HISTORY_QUESTIONS } from "./clinicalRecordFields.js";

/**
 * Patient QR link — real Postgres end to end (CLAUDE.md: no DB mocks). The
 * consent step renders a REAL PDF with the drawn signature; only the
 * Supabase Storage boundary is mocked.
 */
const { uploadMock, deleteMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (path: string) => ({ path, bucket: "partner-documents" })),
  deleteMock: vi.fn(async (_path: string) => undefined),
}));
vi.mock("../services/partnerDocuments.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/partnerDocuments.js")>()),
  uploadPartnerDocument: uploadMock,
  deletePartnerDocument: deleteMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const ORIGIN = "https://pwa-dev.example.test";
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
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
const META = { ip: "203.0.113.7", userAgent: "vitest", requestId: null };
const ALL_NO = Object.fromEntries(MEDICAL_HISTORY_QUESTIONS.map((q) => [q, false]));
const STOP = { snoring: true, tiredness: true, observed_apnea: false, pressure: true };
/** Every phase in the one test transaction (the phases see each other's writes). */
const inTx = (client: Client): PublicRunner => (fn) => fn(client);

// informedConsent needs a current consent text (the patient reads it before signing).
beforeAll(async () => {
  await withPlatform((client) =>
    insertDocumentContentVersion(client, {
      templateKey: "informedConsent",
      locale: "mx",
      contentHtml: "<p>Autorizo el tratamiento con dispositivo de avance mandibular. {legalEntityName}</p><script>alert(1)</script>",
      createdByUserId: "00000000-0000-0000-0000-000000000000",
      createdByName: "QA",
      createdByEmail: "qa@neosleepcare.com",
      createdByTenantSlug: TENANT_SLUG,
      changeNote: "seeded by commands/questionnaireRequest.spec.ts",
    })
  );
}, 15000);

describe("patient QR link — one link for everything the patient has to do", () => {
  it("bundles consent → medical history → S-T-O-P in checklist order; the link dies only after the last step", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Lucía", last_name: `Secreto-${uniqueSuffix()}` });

      const { request, url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, {}, ORIGIN);
      expect(url).toMatch(new RegExp(`^${ORIGIN}/q#[A-Za-z0-9_-]{43}$`));
      expect(request.items).toEqual(["informedConsent", "medicalHistory", "stopBang"]);
      expect(request.kind).toBe("bundle");

      const view = await GetPublicQuestionnaireQuery(client, tokenOf(url), "mx");
      expect(view.patient_first_name).toBe("Lucía");
      expect(JSON.stringify(view)).not.toContain("Secreto");
      expect(view.steps.map((s) => [s.key, s.type, s.done])).toEqual([
        ["informedConsent", "consent", false],
        ["medicalHistory", "medical_history", false],
        ["stopBang", "stop_bang", false],
      ]);
      // Consent text: legal params filled, sanitized to the document allowlist (no <script>).
      expect(view.steps[0]!.consent_html).toContain("avance mandibular");
      expect(view.steps[0]!.consent_html).not.toContain("{legalEntityName}");
      expect(view.steps[0]!.consent_html).not.toContain("<script");

      const first = await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "medicalHistory", consent: true, answers: { ...ALL_NO, has_diabetes: true } }, META);
      expect(first.completed).toBe(false);
      await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "stopBang", consent: true, answers: STOP }, META);
      // Still alive: the consent isn't signed yet.
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(url))).resolves.toBeTruthy();

      const before = uploadMock.mock.calls.length;
      const last = await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE, locale: "mx" }, META);
      expect(last.completed).toBe(true);
      const [path, bytes] = uploadMock.mock.calls[before] as unknown as [string, Uint8Array];
      expect(path).toMatch(new RegExp(`^patient/${patient.id}/consent-informedConsent-`));
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-"); // real render, signature embedded

      await expect(GetPublicQuestionnaireQuery(client, tokenOf(url))).rejects.toThrow(QuestionnaireLinkInvalidError);

      const checklist = await GetPatientChecklistQuery(ctx, patient.id);
      const status = Object.fromEntries(checklist.items.map((i) => [i.key, i.status]));
      expect(status).toMatchObject({ informedConsent: "done", medicalHistory: "done", stopBang: "partial" });

      const { rows } = await client.query(`SELECT purpose, legal_basis, metadata FROM consent WHERE entity_type = 'patient' AND entity_id = $1`, [patient.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ purpose: "informedConsent", legal_basis: "consent" });
      expect(rows[0].metadata).toMatchObject({ signature_method: "drawn", template_key: "informedConsent" });

      const history = checklist.items.find((i) => i.key === "medicalHistory")!.history[0]!;
      const { rows: mh } = await client.query(`SELECT consent_version FROM medical_history_questionnaire WHERE id = $1`, [history.id]);
      expect(mh[0].consent_version).toBe(PATIENT_CONSENT_VERSION);
      const audit = await getAuditLogForEntities(client, ["MedicalHistoryQuestionnaire"], [history.id]);
      expect(audit[0]).toMatchObject({ action: "create", user_id: null });
    });
  }, 60000);

  it("a step already done answers 410 — double submit / double sign never records twice", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Twice-${uniqueSuffix()}` });
      const { url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["informedConsent", "stopBang"] }, ORIGIN);

      await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "stopBang", consent: true, answers: STOP }, META);
      await expect(
        SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "stopBang", consent: true, answers: STOP }, META)
      ).rejects.toThrow(QuestionnaireLinkInvalidError);

      await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE }, META);
      const deletesBefore = deleteMock.mock.calls.length;
      await expect(
        SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE }, META)
      ).rejects.toThrow(QuestionnaireLinkInvalidError);
      expect(deleteMock.mock.calls.length).toBe(deletesBefore); // rejected before rendering — nothing uploaded, nothing to undo
    });
  }, 60000);

  it("a consent signed concurrently (after this submit rendered) is undone — the orphaned upload is deleted", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Race-${uniqueSuffix()}` });
      const { request, url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["informedConsent"] }, ORIGIN);

      // Simulate the other device winning between phase 1 and phase 3.
      let phase = 0;
      const racingRunner: PublicRunner = async (fn) => {
        phase += 1;
        if (phase === 2) await client.query(`UPDATE questionnaire_request SET completed_items = items, used_at = now() WHERE id = $1`, [request.id]);
        return fn(client);
      };
      const deletesBefore = deleteMock.mock.calls.length;
      await expect(
        SubmitPublicQuestionnaireCommand(racingRunner, tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE }, META)
      ).rejects.toThrow(QuestionnaireLinkInvalidError);
      expect(deleteMock.mock.calls.length).toBe(deletesBefore + 1);
    });
  }, 60000);

  it("rejects a missing/foreign signature, missing health consent and incomplete answers", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Invalid-${uniqueSuffix()}` });
      const { url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, {}, ORIGIN);
      const token = tokenOf(url);

      await expect(SubmitPublicQuestionnaireCommand(inTx(client), token, { step: "informedConsent", signatureDataUrl: "https://evil.test/x.png" }, META)).rejects.toThrow(ValidationError);
      await expect(SubmitPublicQuestionnaireCommand(inTx(client), token, { step: "medicalHistory", consent: false, answers: ALL_NO }, META)).rejects.toThrow(ValidationError);
      await expect(SubmitPublicQuestionnaireCommand(inTx(client), token, { step: "medicalHistory", consent: true, answers: { has_hiv: true } }, META)).rejects.toThrow(ValidationError);
      await expect(SubmitPublicQuestionnaireCommand(inTx(client), token, { step: "oralExam", consent: true, answers: {} }, META)).rejects.toThrow(QuestionnaireLinkInvalidError);
    });
  }, 30000);

  it("only patient-completable items can be put on a link; issuing a new link retires overlapping ones; cancel/expiry kill it", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Links-${uniqueSuffix()}` });

      await expect(CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["oralExam"] }, ORIGIN)).rejects.toThrow(ValidationError);

      const first = await CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["medicalHistory"] }, ORIGIN);
      const bundle = await CreateQuestionnaireRequestCommand(ctx, patient.id, {}, ORIGIN);
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(first.url))).rejects.toThrow(QuestionnaireLinkInvalidError);

      await CancelQuestionnaireRequestCommand(ctx, patient.id, bundle.request.id);
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(bundle.url))).rejects.toThrow(QuestionnaireLinkInvalidError);

      const third = await CreateQuestionnaireRequestCommand(ctx, patient.id, { kind: "stop_bang" }, ORIGIN); // legacy body
      expect(third.request.items).toEqual(["stopBang"]);
      await client.query(`UPDATE questionnaire_request SET expires_at = now() - interval '1 minute' WHERE id = $1`, [third.request.id]);
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(third.url))).rejects.toThrow(QuestionnaireLinkInvalidError);

      await expect(GetPublicQuestionnaireQuery(client, "not-a-token")).rejects.toThrow(QuestionnaireLinkInvalidError);
    });
  }, 30000);
});
