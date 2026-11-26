import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion, getCurrentDocumentContentVersion } from "../db/documentContent.js";
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
// The mail provider (Resend) is the other external boundary: the signed-copy email is observed, never sent.
const { copyEmailMock } = vi.hoisted(() => ({ copyEmailMock: vi.fn(async (..._args: unknown[]): Promise<string | null> => `re_copy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`) }));
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendPatientSignedCopyEmail: copyEmailMock,
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
// It's the real template key in the shared platform schema, so the seeded
// version is removed afterwards and the previous current text restored.
let seeded: { id: string; previousId: string | null } | null = null;
beforeAll(async () => {
  seeded = await withPlatform(async (client) => {
    const previous = await getCurrentDocumentContentVersion(client, "informedConsent", "mx");
    const version = await insertDocumentContentVersion(client, {
      templateKey: "informedConsent",
      locale: "mx",
      contentHtml: "<p>Autorizo el tratamiento con dispositivo de avance mandibular. {legalEntityName}</p><script>alert(1)</script>",
      createdByUserId: "00000000-0000-0000-0000-000000000000",
      createdByName: "QA",
      createdByEmail: "qa@neosleepcare.com",
      createdByTenantSlug: TENANT_SLUG,
      changeNote: "seeded by commands/questionnaireRequest.spec.ts",
    });
    return { id: version.id, previousId: previous?.id ?? null };
  });
}, 15000);

afterAll(async () => {
  if (!seeded) return;
  const { id, previousId } = seeded;
  await withPlatform(async (client) => {
    await client.query(`DELETE FROM platform.document_content_version WHERE id = $1`, [id]);
    if (previousId) await client.query(`UPDATE platform.document_content_version SET is_current = true WHERE id = $1`, [previousId]);
  });
});

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
      // A consent is still to be signed: "First L." next to the pad, never the surname (NEO-126, legal 2026-09-28).
      expect(view.signer_name).toBe("Lucía S.");
      expect(JSON.stringify(view)).not.toContain("Secreto");
      expect(view.copy_email).toBeNull(); // no email on file
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
      expect(first).not.toHaveProperty("signed_copy");
      // Still alive: the consent isn't signed yet.
      await expect(GetPublicQuestionnaireQuery(client, tokenOf(url))).resolves.toBeTruthy();

      const before = uploadMock.mock.calls.length;
      const last = await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE, privacyNoticeAccepted: true, locale: "mx", readToEnd: true }, META);
      expect(last.completed).toBe(true);
      // The signer gets the signed PDF back once, to download (NEO-126).
      expect(last.signed_copy!.filename).toMatch(/^informedConsent-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(Buffer.from(last.signed_copy!.pdf_base64, "base64").subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const [path, bytes] = uploadMock.mock.calls[before] as unknown as [string, Uint8Array];
      expect(path).toMatch(new RegExp(`^patient/${patient.id}/consent-informedConsent-`));
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-"); // real render, signature embedded
      // NEO-252: the drawn signature is stored on its own too, for later prints (the Historia clínica).
      const [pngPath, pngBytes, pngType] = uploadMock.mock.calls[before + 1] as unknown as [string, Uint8Array, string];
      expect(pngPath).toMatch(new RegExp(`^patient/${patient.id}/consent-informedConsent-\\d+-signature\\.png$`));
      expect(pngType).toBe("image/png");
      expect(`data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`).toBe(SIGNATURE);

      await expect(GetPublicQuestionnaireQuery(client, tokenOf(url))).rejects.toThrow(QuestionnaireLinkInvalidError);

      const checklist = await GetPatientChecklistQuery(ctx, patient.id);
      const status = Object.fromEntries(checklist.items.map((i) => [i.key, i.status]));
      expect(status).toMatchObject({ informedConsent: "done", medicalHistory: "done", stopBang: "partial" });

      const { rows } = await client.query(`SELECT purpose, legal_basis, metadata FROM consent WHERE entity_type = 'patient' AND entity_id = $1`, [patient.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ purpose: "informedConsent", legal_basis: "consent" });
      expect(rows[0].metadata).toMatchObject({ signature_method: "drawn", template_key: "informedConsent", read_to_end: true, signature_path: pngPath });

      const history = checklist.items.find((i) => i.key === "medicalHistory")!.history[0]!;
      const { rows: mh } = await client.query(`SELECT consent_version FROM medical_history_questionnaire WHERE id = $1`, [history.id]);
      expect(mh[0].consent_version).toBe(PATIENT_CONSENT_VERSION);
      const audit = await getAuditLogForEntities(client, ["MedicalHistoryQuestionnaire"], [history.id]);
      expect(audit[0]).toMatchObject({ action: "create", user_id: null });

      // STOP-Bang is only "partial" now, but what's missing (B-A-N-G) is the clinician's — nothing left for the patient.
      await expect(CreateQuestionnaireRequestCommand(ctx, patient.id, {}, ORIGIN)).rejects.toThrow(ValidationError);
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

      await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE, privacyNoticeAccepted: true }, META);
      const deletesBefore = deleteMock.mock.calls.length;
      await expect(
        SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE, privacyNoticeAccepted: true }, META)
      ).rejects.toThrow(QuestionnaireLinkInvalidError);
      expect(deleteMock.mock.calls.length).toBe(deletesBefore); // rejected before rendering — nothing uploaded, nothing to undo
    });
  }, 60000);

  it("a consent signed concurrently (after this submit rendered) is undone — the orphaned uploads (PDF + signature) are deleted", async () => {
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
        SubmitPublicQuestionnaireCommand(racingRunner, tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE, privacyNoticeAccepted: true }, META)
      ).rejects.toThrow(QuestionnaireLinkInvalidError);
      expect(deleteMock.mock.calls.slice(deletesBefore).map(([path]) => path)).toEqual([
        expect.stringMatching(/\.pdf$/),
        expect.stringMatching(/-signature\.png$/),
      ]);
    });
  }, 60000);

  it("CORE-113: a consent is signed only after accepting the clinic's privacy notice, which is stored with the signature (platform notice when the clinic has none)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Aviso-${uniqueSuffix()}` });
      const { url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["informedConsent"] }, ORIGIN);
      const token = tokenOf(url);

      const page = await GetPublicQuestionnaireQuery(client, token);
      expect(page.clinic_privacy_notice_own).toBe(false);
      expect(page.clinic_privacy_notice_url).toBe(page.privacy_notice_url);

      await expect(
        SubmitPublicQuestionnaireCommand(inTx(client), token, { step: "informedConsent", signatureDataUrl: SIGNATURE, locale: "mx", readToEnd: true }, META)
      ).rejects.toThrow(ValidationError);

      await SubmitPublicQuestionnaireCommand(inTx(client), token, { step: "informedConsent", signatureDataUrl: SIGNATURE, privacyNoticeAccepted: true, locale: "mx", readToEnd: true }, META);
      const { rows } = await client.query<{ notice: { url: string; own: boolean; accepted_at: string } }>(
        `SELECT metadata->'privacy_notice' AS notice FROM consent WHERE entity_id = $1 AND purpose = 'informedConsent'`,
        [patient.id]
      );
      expect(rows[0]!.notice.url).toBe(page.privacy_notice_url);
      expect(rows[0]!.notice.own).toBe(false);
      expect(rows[0]!.notice.accepted_at).toBeTruthy();
    });
  }, 30000);

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

  it("the signed copy is emailed only when asked for and only to an address that is the patient's alone", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const own = `qa-copy-${uniqueSuffix()}@example.test`;
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Copy-${uniqueSuffix()}`, email: own });
      const { url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["informedConsent"] }, ORIGIN);

      const view = await GetPublicQuestionnaireQuery(client, tokenOf(url));
      expect(view.copy_email).toBe(`q***@example.test`); // masked, never the full address

      copyEmailMock.mockClear();
      const result = await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(url), { step: "informedConsent", signatureDataUrl: SIGNATURE, privacyNoticeAccepted: true, sendCopy: true }, META);
      expect(result.copy_emailed).toBe(true);
      expect(copyEmailMock).toHaveBeenCalledTimes(1);
      const [to, , , document] = copyEmailMock.mock.calls[0] as unknown as [string, unknown, unknown, { filename: string; content: Buffer }];
      expect(to).toBe(own);
      expect(document.content.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const { rows } = await client.query(
        `SELECT entity_after FROM audit_log WHERE action = 'notify' AND entity_after->>'patient_id' = $1`,
        [patient.id]
      );
      expect(rows[0].entity_after).toMatchObject({ channel: "email", sent_to: "q***@example.test" });
      // NEO-190: logged for its delivery status, without a sender (the patient asked for it).
      const sends = await client.query("SELECT kind, sent_by, sent_to_masked FROM patient_email_send WHERE patient_id = $1", [patient.id]);
      expect(sends.rows).toEqual([{ kind: "signed_copy", sent_by: null, sent_to_masked: "q***@example.test" }]);

      // A family inbox: the same address on a second patient → no copy offered, none sent even if asked.
      const sibling = await insertPatient(client, { first_name: "Eva", last_name: `Copy-${uniqueSuffix()}`, email: own });
      const second = await CreateQuestionnaireRequestCommand(ctx, sibling.id, { items: ["informedConsent"] }, ORIGIN);
      expect((await GetPublicQuestionnaireQuery(client, tokenOf(second.url))).copy_email).toBeNull();
      copyEmailMock.mockClear();
      const shared = await SubmitPublicQuestionnaireCommand(inTx(client), tokenOf(second.url), { step: "informedConsent", signatureDataUrl: SIGNATURE, privacyNoticeAccepted: true, sendCopy: true }, META);
      expect(shared.copy_emailed).toBeUndefined();
      expect(copyEmailMock).not.toHaveBeenCalled();
    });
  }, 60000);

  it("only patient-completable items can be put on a link; issuing a new link retires overlapping ones; cancel/expiry kill it", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Links-${uniqueSuffix()}` });

      await expect(CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["oralExam"] }, ORIGIN)).rejects.toThrow(ValidationError);

      const first = await CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["medicalHistory"] }, ORIGIN);
      // No consent on the link: the page gets the first name only, never the full name (NEO-126).
      const questionnaireOnly = await GetPublicQuestionnaireQuery(client, tokenOf(first.url));
      expect(questionnaireOnly.signer_name).toBeNull();
      expect(questionnaireOnly.copy_email).toBeNull();
      expect(JSON.stringify(questionnaireOnly)).not.toContain("Links-");
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
