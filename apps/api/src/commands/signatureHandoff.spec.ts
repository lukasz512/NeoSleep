import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ValidationError } from "../errors.js";
import {
  StartSignatureHandoffCommand,
  StartDoctorSignHandoffCommand,
  GetSignatureHandoffForPhoneQuery,
  SignSignatureHandoffCommand,
  PickUpSignatureHandoffCommand,
  SIGNATURE_HANDOFF_TTL_MS,
} from "./signatureHandoff.js";
import { CreateQuestionnaireRequestCommand, StartPatientSignHandoffCommand, QuestionnaireLinkInvalidError } from "./questionnaireRequest.js";

// Real Postgres, no mocks (CLAUDE.md rule 5). CORE-172.

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const META = () => ({ requestId: crypto.randomUUID(), ip: "203.0.113.9", userAgent: "vitest-phone" });
type Client = TenantContext["client"];

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function staffContext(client: Client): Promise<TenantContext> {
  const email = `qa-handoff-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "Lorena", "Handoff", "admin", hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

const start = (client: Client, ownerRef = `owner-${uniqueSuffix()}`, now?: Date) =>
  StartSignatureHandoffCommand(client, { purpose: "doctor_print", ownerRef, label: { signerName: "Dra. Test" } }, now);

describe("signature handoff — the QR next to a signature pad (CORE-172)", () => {
  it("hands the phone's signature to the computer exactly once; the two secrets do different jobs", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { handoffToken: h, pickupToken: p } = await start(client);

      expect(await GetSignatureHandoffForPhoneQuery(client, h)).toEqual({ status: "pending", purpose: "doctor_print", signerName: "Dra. Test", versionLabel: null });
      expect(await PickUpSignatureHandoffCommand(client, p)).toEqual({ status: "pending" });
      // The pickup secret can't sign or read, and the QR secret can't pick up.
      expect(await GetSignatureHandoffForPhoneQuery(client, p)).toBeNull();
      expect(await SignSignatureHandoffCommand(client, { handoffToken: p, signatureDataUrl: SIGNATURE }, META())).toBe(false);
      expect(await PickUpSignatureHandoffCommand(client, h)).toEqual({ status: "expired" });

      expect(await SignSignatureHandoffCommand(client, { handoffToken: h, signatureDataUrl: SIGNATURE }, META())).toBe(true);
      expect(await SignSignatureHandoffCommand(client, { handoffToken: h, signatureDataUrl: SIGNATURE }, META())).toBe(false);
      expect((await GetSignatureHandoffForPhoneQuery(client, h))?.status).toBe("signed");

      expect(await PickUpSignatureHandoffCommand(client, p)).toEqual({ status: "signed", signatureDataUrl: SIGNATURE });
      expect(await PickUpSignatureHandoffCommand(client, p)).toEqual({ status: "expired" });
      expect(await GetSignatureHandoffForPhoneQuery(client, h)).toBeNull();
    });
  }, 30000);

  it("expires after 15 minutes, and a new QR for the same pad retires the old one", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const owner = `owner-${uniqueSuffix()}`;
      const now = new Date();
      const later = new Date(now.getTime() + SIGNATURE_HANDOFF_TTL_MS + 1);
      const first = await start(client, owner, now);

      expect(await GetSignatureHandoffForPhoneQuery(client, first.handoffToken, later)).toBeNull();
      expect(await SignSignatureHandoffCommand(client, { handoffToken: first.handoffToken, signatureDataUrl: SIGNATURE }, META(), later)).toBe(false);
      expect(await PickUpSignatureHandoffCommand(client, first.pickupToken, later)).toEqual({ status: "expired" });

      const second = await start(client, owner, now);
      expect(await GetSignatureHandoffForPhoneQuery(client, first.handoffToken, now)).toBeNull();
      expect(await PickUpSignatureHandoffCommand(client, first.pickupToken, now)).toEqual({ status: "expired" });
      expect((await GetSignatureHandoffForPhoneQuery(client, second.handoffToken, now))?.status).toBe("pending");
    });
  }, 30000);

  it("rejects a non-PNG or oversized signature, and records the phone signing in the audit log", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { handoffToken: h } = await start(client);
      await expect(SignSignatureHandoffCommand(client, { handoffToken: h, signatureDataUrl: "data:image/svg+xml;base64,AAAA" }, META())).rejects.toThrow(ValidationError);
      await expect(
        SignSignatureHandoffCommand(client, { handoffToken: h, signatureDataUrl: `data:image/png;base64,${"A".repeat(400_001)}` }, META())
      ).rejects.toThrow(ValidationError);

      const meta = META();
      await SignSignatureHandoffCommand(client, { handoffToken: h, signatureDataUrl: SIGNATURE }, meta);
      const { rows } = await client.query<{ user_ip: string | null; entity_after: { purpose: string } }>(
        `SELECT user_ip, entity_after FROM audit_log WHERE action = 'sign_on_phone' AND request_id = $1`,
        [meta.requestId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.user_ip).toBe("203.0.113.9");
      expect(rows[0]?.entity_after.purpose).toBe("doctor_print");
    });
  }, 30000);

  it("doctor: starts from the session and shows the doctor's name", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await staffContext(client);
      const { handoffToken: h } = await StartDoctorSignHandoffCommand(ctx);
      const phone = await GetSignatureHandoffForPhoneQuery(client, h);
      expect(phone?.purpose).toBe("doctor_print");
      expect(phone?.signerName).toContain("Lorena");
    });
  }, 30000);

  it("patient: starts from the questionnaire link and shows only 'First L.'; a dead link starts nothing", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await staffContext(client);
      const patient = await insertPatient(client, { first_name: "Lucía", last_name: `Secreto-${uniqueSuffix()}` });
      const { url } = await CreateQuestionnaireRequestCommand(ctx, patient.id, { items: ["medicalHistory"] }, "https://pwa.test");
      const token = url.split("#")[1]!;

      const { handoffToken: h } = await StartPatientSignHandoffCommand(client, token);
      expect(await GetSignatureHandoffForPhoneQuery(client, h)).toMatchObject({ purpose: "patient_consent", signerName: "Lucía S." });

      await expect(StartPatientSignHandoffCommand(client, "x".repeat(43))).rejects.toThrow(QuestionnaireLinkInvalidError);
    });
  }, 30000);
});
