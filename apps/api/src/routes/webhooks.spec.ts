import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

// env.ts reads RESEND_WEBHOOK_SECRET at import time — set it before server.js loads.
const SECRET_KEY = vi.hoisted(() => {
  const key = Buffer.from("neo190-test-signing-key-32-bytes!").toString("base64");
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${key}`;
  return key;
});

import { app } from "../server.js";
import { withTenant, insertPatient, insertStaffUser } from "../db.js";
import { insertPatientEmailSend } from "../db/patientEmailSend.js";
import { verifyResendWebhook, ResendWebhookNotConfiguredError } from "../mailer.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * NEO-190: Resend's webhook moves a patient email's delivery status, through
 * the real Express stack (raw body + signature) and real Postgres.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Standard Webhooks signature, as Resend (Svix) computes it. */
function sign(body: string, key = SECRET_KEY): Record<string, string> {
  const id = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`, "content-type": "application/json" };
}

function event(type: string, emailId: string, extra: Record<string, unknown> = {}, tenant: string | null = TENANT_SLUG): string {
  return JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: emailId,
      created_at: new Date().toISOString(),
      from: "notifications@mail.neosleepcare.com",
      to: ["p***@example.mx"],
      subject: "x",
      message_id: `<${emailId}@resend>`,
      ...(tenant ? { tags: { tenant, kind: "questionnaire_link" } } : {}),
      ...extra,
    },
  });
}

async function post(body: string, headers = sign(body)) {
  return request(app).post("/api/v1/webhooks/resend").set(headers).send(body);
}

async function sentEmail(): Promise<{ patientId: string; messageId: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const patient = await insertPatient(client, { first_name: "Web", last_name: `Hook-${suffix()}`, region: "MX" });
    const messageId = `re_${randomUUID()}`;
    await insertPatientEmailSend(client, { patientId: patient.id, sentBy: null, kind: "questionnaire_link", sentToMasked: "w***@example.mx", providerMessageId: messageId });
    return { patientId: patient.id, messageId };
  });
}

async function statusOf(messageId: string): Promise<{ status: string; status_detail: string | null }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const { rows } = await client.query<{ status: string; status_detail: string | null }>(
      "SELECT status, status_detail FROM patient_email_send WHERE provider_message_id = $1",
      [messageId]
    );
    return rows[0]!;
  });
}

async function staffAuth(role: StaffRole): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-webhook-${role}-${suffix()}@neosleepcare.com`;
    const user = await insertStaffUser(client, email, "QA", "Webhook", role, await bcrypt.hash("x", 4), false);
    return `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`;
  });
}

describe("POST /webhooks/resend", () => {
  it("marks the email delivered when Resend says so", async () => {
    const { messageId } = await sentEmail();
    const res = await post(event("email.delivered", messageId));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("applied");
    expect((await statusOf(messageId)).status).toBe("delivered");
  });

  it("stores why a bounce happened", async () => {
    const { messageId } = await sentEmail();
    await post(event("email.bounced", messageId, { bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" } }));
    expect(await statusOf(messageId)).toEqual({ status: "bounced", status_detail: "Permanent · General · Mailbox does not exist" });
  });

  it("never moves back: a late 'delayed' after 'delivered' is ignored, a spam complaint still wins", async () => {
    const { messageId } = await sentEmail();
    await post(event("email.delivered", messageId));
    const late = await post(event("email.delivery_delayed", messageId));
    expect(late.body.outcome).toBe("stale");
    expect((await statusOf(messageId)).status).toBe("delivered");
    await post(event("email.complained", messageId));
    expect((await statusOf(messageId)).status).toBe("complained");
  });

  it("rejects a wrong signature and changes nothing", async () => {
    const { messageId } = await sentEmail();
    const body = event("email.delivered", messageId);
    const forged = sign(body, Buffer.from("some-other-key-not-the-real-one").toString("base64"));
    const res = await post(body, forged);
    expect(res.status).toBe(400);
    expect((await statusOf(messageId)).status).toBe("sent");
  });

  it("rejects a body changed after signing", async () => {
    const { messageId } = await sentEmail();
    const headers = sign(event("email.delivered", messageId));
    const res = await post(event("email.complained", messageId), headers);
    expect(res.status).toBe(400);
  });

  it("answers 200 but touches nothing for emails that aren't patient emails", async () => {
    const { messageId } = await sentEmail();
    expect((await post(event("email.delivered", messageId, {}, null))).body.outcome).toBe("no_tenant");
    expect((await post(event("email.delivered", messageId, {}, "no_such_tenant"))).body.outcome).toBe("no_tenant");
    expect((await post(event("email.delivered", `re_${randomUUID()}`))).body.outcome).toBe("unknown_email");
    expect((await post(event("email.opened", messageId))).body.outcome).toBe("ignored_event");
    expect((await statusOf(messageId)).status).toBe("sent");
  });

  it("refuses to verify anything without a configured secret", () => {
    expect(() => verifyResendWebhook("{}", { id: "a", timestamp: "1", signature: "v1,x" }, null)).toThrow(ResendWebhookNotConfiguredError);
    expect(() => verifyResendWebhook("{}", { id: "a", timestamp: "1", signature: "v1,x" }, `whsec_${randomBytes(24).toString("base64")}`)).toThrow();
  });
});

describe("GET /patient/:id/email-sends", () => {
  it("lists what was sent and its status, masked, newest first", async () => {
    const { patientId, messageId } = await sentEmail();
    await post(event("email.delivered", messageId));
    const res = await request(app).get(`/api/v1/patient/${patientId}/email-sends`).set("Authorization", await staffAuth("admin"));
    expect(res.status).toBe(200);
    expect(res.body.sends).toHaveLength(1);
    expect(res.body.sends[0]).toMatchObject({ kind: "questionnaire_link", sent_to_masked: "w***@example.mx", status: "delivered" });
    expect(res.body.sends[0]).not.toHaveProperty("provider_message_id");
  });

  it("is closed to roles that can't see studies", async () => {
    const { patientId } = await sentEmail();
    const res = await request(app).get(`/api/v1/patient/${patientId}/email-sends`).set("Authorization", await staffAuth("rep"));
    expect(res.status).toBe(403);
  });
});
