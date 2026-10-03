import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import type { AppointmentEmail } from "../mailer.js";

/**
 * CORE-113 (decision form consent-visit-r1, Z1 + Z2): the appointment
 * confirmation carries the informed consent to sign — only when the current
 * text is unsigned, and the signing link only to an address that is the
 * patient's alone. Real Express + real Postgres; only Resend is stubbed.
 */
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async (..._args: unknown[]): Promise<string | null> => `re_test_${Math.random().toString(36).slice(2)}`),
}));
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendAppointmentPatientEmail: sendMock,
}));

const { app } = await import("../server.js");
const { withTenant, withPlatform, insertStaffUser, insertPatient, insertPractitioner } = await import("../db.js");
const { insertDocumentContentVersion, getCurrentDocumentContentVersion } = await import("../db/documentContent.js");
const { signAuthToken } = await import("../utils/jwt.js");

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const unique = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let slot = 0;
const futureSlot = (): string => new Date(Date.UTC(2033, 0, 1, 8) + (slot += 3) * 3_600_000 + Math.floor(Math.random() * 1_000) * 86_400_000).toISOString();

// A current MX consent text in the shared platform schema, removed afterwards (same as questionnaireRequest.spec).
let seeded: { id: string; previousId: string | null } | null = null;
beforeAll(async () => {
  seeded = await withPlatform(async (client) => {
    const previous = await getCurrentDocumentContentVersion(client, "informedConsent", "mx");
    const version = await insertDocumentContentVersion(client, {
      templateKey: "informedConsent",
      locale: "mx",
      contentHtml: "<p>Autorizo el tratamiento. {legalEntityName}</p>",
      createdByUserId: "00000000-0000-0000-0000-000000000000",
      createdByName: "QA",
      createdByEmail: "qa@neosleepcare.com",
      createdByTenantSlug: TENANT_SLUG,
      changeNote: "seeded by routes/appointmentConsent.spec.ts",
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

async function admin(): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-consent-admin-${unique()}@neosleepcare.com`;
    const user = await insertStaffUser(client, email, "QA", "Admin", "admin", await bcrypt.hash("x", 4), false);
    return `Bearer ${signAuthToken({ id: user!.id, email, role: "admin", token_version: 0 })}`;
  });
}

async function patient(email: string): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const doc = await insertPractitioner(client, { first_name: "Ana", last_name: `Doc-${unique()}`, email: `qa-consent-doc-${unique()}@neosleepcare.com` });
    const p = await insertPatient(client, { first_name: "Pac", last_name: `C-${unique()}`, practitioner_id: doc.id, email, region: "MX" });
    return p.id;
  });
}

function lastEmail(): AppointmentEmail {
  const call = sendMock.mock.calls.at(-1);
  if (!call) throw new Error("no appointment email was sent");
  return call[2] as AppointmentEmail;
}

const book = (auth: string, patientId: string) =>
  request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: patientId, start_at: futureSlot() });

describe("clinic's own aviso de privacidad (organization.privacy_notice_url, CORE-113 Z3)", () => {
  it("is stored as an https URL (scheme added when missing); http or a non-address is a 400 on that field", async () => {
    const auth = await admin();
    const base = { country_code: "MX", phone: "+52 55 1234 5678" };
    const ok = await request(app).post("/api/v1/organization").set("Authorization", auth)
      .send({ ...base, name: `Clínica Aviso ${unique()}`, email: `qa-aviso-${unique()}@example.org`, privacy_notice_url: "clinica.mx/aviso" });
    expect(ok.status).toBe(201);
    expect(ok.body.privacy_notice_url).toBe("https://clinica.mx/aviso");

    for (const bad of ["http://clinica.mx/aviso", "no es un enlace"]) {
      const res = await request(app).patch(`/api/v1/organization/${ok.body.id}`).set("Authorization", auth).send({ privacy_notice_url: bad });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("privacy_notice_url");
    }
  });
});

describe("informed consent in the appointment confirmation (CORE-113)", () => {
  beforeEach(() => sendMock.mockClear());

  it("unsigned + own address: the email carries a consent-only link that lives until the visit ends and opens the signing page", async () => {
    const auth = await admin();
    const patientId = await patient(`qa-consent-own-${unique()}@example.org`);
    const res = await book(auth, patientId);
    expect(res.status).toBe(201);

    const link = lastEmail().consent?.link;
    expect(link).toMatch(/\/q#[A-Za-z0-9_-]{43}$/);
    const row = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ items: string[]; expires_at: Date }>(`SELECT items, expires_at FROM questionnaire_request WHERE patient_id = $1`, [patientId])
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]!.items).toEqual(["informedConsent"]);
    expect(row.rows[0]!.expires_at.toISOString()).toBe(res.body.end_at);

    const lookup = await request(app).post("/api/v1/public/questionnaire/lookup").send({ token: link!.split("#")[1], locale: "mx" });
    expect(lookup.status).toBe(200);
    expect(lookup.body.steps.map((s: { key: string }) => s.key)).toEqual(["informedConsent"]);
  });

  it("an address shared with someone else gets 'sign at the clinic' and no link", async () => {
    const auth = await admin();
    const shared = `qa-consent-shared-${unique()}@example.org`;
    await patient(shared); // a relative already uses this address
    const patientId = await patient(shared);
    await book(auth, patientId);
    expect(lastEmail().consent).toEqual({ link: null });
    const rows = await withTenant(TENANT_SLUG, (client) => client.query(`SELECT 1 FROM questionnaire_request WHERE patient_id = $1`, [patientId]));
    expect(rows.rowCount).toBe(0);
  });

  it("a signature of the current text means nothing to sign", async () => {
    const auth = await admin();
    const patientId = await patient(`qa-consent-signed-${unique()}@example.org`);
    await withTenant(TENANT_SLUG, (client) =>
      client.query(
        `INSERT INTO consent (entity_type, entity_id, legal_basis, jurisdiction, purpose, granted_at, metadata)
         VALUES ('patient', $1, 'consent', 'MX', 'informedConsent', now(), jsonb_build_object('content_version_id', $2::text))`,
        [patientId, seeded!.id]
      )
    );
    await book(auth, patientId);
    expect(lastEmail().consent).toBeNull();
  });

  it("an existing QR / emailed link of the patient is left alive", async () => {
    const auth = await admin();
    const patientId = await patient(`qa-consent-keep-${unique()}@example.org`);
    const qr = await request(app).post(`/api/v1/patient/${patientId}/questionnaire-requests`).set("Authorization", auth).send({});
    expect(qr.status).toBe(201);
    await book(auth, patientId);
    const live = await withTenant(TENANT_SLUG, (client) =>
      client.query(`SELECT 1 FROM questionnaire_request WHERE patient_id = $1 AND cancelled_at IS NULL`, [patientId])
    );
    expect(live.rowCount).toBe(2);
  });

  it("a cancellation never asks to sign", async () => {
    const auth = await admin();
    const patientId = await patient(`qa-consent-cancel-${unique()}@example.org`);
    const created = await book(auth, patientId);
    await request(app).patch(`/api/v1/appointments/${created.body.id}`).set("Authorization", auth).send({ status: "cancelled" });
    expect(lastEmail().kind).toBe("cancelled");
    expect(lastEmail().consent ?? null).toBeNull();
  });
});
