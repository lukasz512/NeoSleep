import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import type { TenantContext } from "../context/TenantContext.js";
import {
  SendQuestionnaireEmailCommand,
  PatientHasNoEmailError,
  QuestionnaireEmailUnavailableError,
  GetPublicQuestionnaireQuery,
  maskEmail,
} from "./questionnaireRequest.js";

/**
 * "Send questionnaires by email" — real Postgres (CLAUDE.md: no DB mocks);
 * only the Resend boundary (mailer.ts) is mocked, same pattern as
 * commands/users.spec.ts.
 */
const { sendMock, confirmMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async (..._args: unknown[]): Promise<string | null> => "re_test_message"),
  confirmMock: vi.fn(async (..._args: unknown[]): Promise<void> => undefined),
}));
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendQuestionnaireLinkEmail: sendMock,
  sendEmailSentConfirmation: confirmMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const ORIGIN = "https://pwa-dev.example.test";
type Client = TenantContext["client"];

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildContext(client: Client): Promise<TenantContext> {
  const email = `qa-questionnaire-email-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "QA", "Doctor", "admin", hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

beforeEach(() => {
  confirmMock.mockReset();
  sendMock.mockReset();
  sendMock.mockResolvedValue(`re_${uniqueSuffix()}`);
});

describe("SendQuestionnaireEmailCommand", () => {
  it("emails one personal link covering every open questionnaire, in the patient's language, and audits it without health data", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      // identities.email is unique — every run needs its own address.
      const email = `lucia.correo.${uniqueSuffix()}@example.mx`;
      const patient = await insertPatient(client, { first_name: "Lucía", last_name: `Correo-${uniqueSuffix()}`, email, region: "MX" });

      const { request, sent_to } = await SendQuestionnaireEmailCommand(ctx, patient.id, ORIGIN);
      expect(sent_to).toBe("l***@example.mx");
      expect(request.items).toEqual(["informedConsent", "medicalHistory", "stopBang"]);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const [to, link, recipient, , count, tags] = sendMock.mock.calls[0]!;
      expect(tags).toEqual({ tenant: TENANT_SLUG, kind: "questionnaire_link" });
      expect(to).toBe(email);
      expect(link).toMatch(new RegExp(`^${ORIGIN}/q#[A-Za-z0-9_-]{43}$`));
      expect(recipient).toMatchObject({ firstName: "Lucía", language: "mx" });
      expect(count).toBe(3);
      // The emailed link is a working questionnaire link.
      await expect(GetPublicQuestionnaireQuery(client, String(link).split("#")[1]!)).resolves.toBeTruthy();

      const audit = await getAuditLogForEntities(client, ["QuestionnaireRequest"], [request.id]);
      const notify = audit.find((row) => row.action === "notify");
      expect(notify?.entity_after).toMatchObject({ channel: "email", sent_to: "l***@example.mx", items: 3 });
      expect(JSON.stringify(notify?.entity_after)).not.toContain(email);

      // NEO-190: the send is logged with Resend's id, so its delivery status can follow.
      const messageId = await sendMock.mock.results[0]!.value;
      const { rows } = await client.query(
        "SELECT kind, sent_to_masked, status, questionnaire_request_id, sent_by FROM patient_email_send WHERE provider_message_id = $1",
        [messageId]
      );
      expect(rows).toEqual([{ kind: "questionnaire_link", sent_to_masked: "l***@example.mx", status: "sent", questionnaire_request_id: request.id, sent_by: ctx.user.id }]);
    });
  });

  it("refuses when the patient has no email — no link is left behind", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Sin", last_name: `Correo-${uniqueSuffix()}` });
      await expect(SendQuestionnaireEmailCommand(ctx, patient.id, ORIGIN)).rejects.toThrow(PatientHasNoEmailError);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  it("emails only the documents the doctor picked, with a link valid for 7 days (NEO-192)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Rosa", last_name: `Elige-${uniqueSuffix()}`, email: `rosa.${uniqueSuffix()}@example.mx`, region: "MX" });

      const before = Date.now();
      const { request, url } = await SendQuestionnaireEmailCommand(ctx, patient.id, ORIGIN, { items: ["stopBang"] });

      expect(request.items).toEqual(["stopBang"]);
      expect(url).toMatch(new RegExp(`^${ORIGIN}/q#[A-Za-z0-9_-]{43}$`));
      const days = (new Date(request.expires_at).getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);
      const [, , , , count, , validDays] = sendMock.mock.calls[0]!;
      expect(count).toBe(1);
      expect(validDays).toBe(7);
      expect(confirmMock).not.toHaveBeenCalled();
    });
  });

  it("refuses a document the patient can't do online", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Rosa", last_name: `NoOnline-${uniqueSuffix()}`, email: `rosa.${uniqueSuffix()}@example.mx` });
      await expect(SendQuestionnaireEmailCommand(ctx, patient.id, ORIGIN, { items: ["historiaEndo"] })).rejects.toThrow(/can't be completed by the patient/);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  it("sends the doctor a confirmation without any link when asked (D4)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Lucía", last_name: `Copia-${uniqueSuffix()}`, email: `lucia.${uniqueSuffix()}@example.mx`, region: "MX" });

      await SendQuestionnaireEmailCommand(ctx, patient.id, ORIGIN, { copy_to_me: true });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      const [to, info] = confirmMock.mock.calls[0] as [string, Record<string, unknown>];
      expect(to).toBe(ctx.user.email);
      expect(info).toMatchObject({ patient: "Lucía C.", sentTo: "l***@example.mx", count: 3, language: "mx" });
      expect(JSON.stringify(info)).not.toContain("/q#");
    });
  });

  it("a rejected address reaches the caller as EMAIL_REJECTED through withTenant, not DB_ERROR (NEO-202)", async () => {
    const { EmailRejectedError } = await import("../mailer.js");
    sendMock.mockRejectedValue(new EmailRejectedError("validation_error: Invalid `to` field"));
    const err = await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Quique", last_name: `Rechazo-${uniqueSuffix()}`, email: `q.${uniqueSuffix()}@example.com` });
      return SendQuestionnaireEmailCommand(ctx, patient.id, ORIGIN);
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "EMAIL_REJECTED", statusCode: 422 });
  });

  it("reports a failure instead of 'sent' when email isn't available", async () => {
    sendMock.mockResolvedValue(null);
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Correo-${uniqueSuffix()}`, email: `ana.${uniqueSuffix()}@example.mx` });
      await expect(SendQuestionnaireEmailCommand(ctx, patient.id, ORIGIN)).rejects.toThrow(QuestionnaireEmailUnavailableError);
    });
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("maria.lopez@example.mx")).toBe("m***@example.mx");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});
