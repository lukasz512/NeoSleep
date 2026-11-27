import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPractitioner } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import { applyEmailStatus } from "../db/emailSend.js";
import { ensurePartnerDocumentsReady } from "../testing/partnerDocumentsFixture.js";
import { INVITE_COOLDOWN_SECONDS } from "../env.js";
import type { StaffRole } from "../db/users.js";

/**
 * NEO-273 HTTP-boundary tests: the invite delivery log endpoint, the 429 body
 * (with retryAfter) on a too-early resend, RBAC, and a webhook status that
 * arrives out of order. Real DB; only the Resend boundary (mailer) is mocked.
 */
const { sendPartnerInviteEmailMock } = vi.hoisted(() => ({
  sendPartnerInviteEmailMock: vi.fn(),
}));
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendPartnerInviteEmail: sendPartnerInviteEmailMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function makeUser(role: StaffRole): Promise<{ token: string; id: string }> {
  const email = `qa-esend-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await withTenant(TENANT_SLUG, async (client) => {
    const created = await insertStaffUser(client, email, "QA", "Sender", role, hash, false);
    // Activation refuses to send unless the partner documents are ready (NEO-51).
    if (role === "admin") await ensurePartnerDocumentsReady(client, created!.id);
    return created;
  });
  return { id: user!.id, token: signAuthToken({ id: user!.id, email, role, token_version: 0 }) };
}

async function makePractitioner(): Promise<string> {
  const p = await withTenant(TENANT_SLUG, (client) =>
    insertPractitioner(client, {
      first_name: "Log",
      last_name: `Route-${uniqueSuffix()}`,
      email: `qa-esend-hcp-${uniqueSuffix()}@example.com`,
      region: "PL",
    })
  );
  return p.id;
}

describe("practitioner invite delivery log", () => {
  it("401s without a token and 403s for a rep", async () => {
    const id = await makePractitioner();
    expect((await request(app).get(`/api/v1/practitioner/${id}/email-sends`)).status).toBe(401);
    const rep = await makeUser("rep");
    const res = await request(app).get(`/api/v1/practitioner/${id}/email-sends`).set("Authorization", `Bearer ${rep.token}`);
    expect(res.status).toBe(403);
  });

  it("lists the invite with sender name and masked address, then 429s a resend with retryAfter", async () => {
    sendPartnerInviteEmailMock.mockResolvedValueOnce(`msg-${uniqueSuffix()}`);
    const admin = await makeUser("admin");
    const id = await makePractitioner();

    const first = await request(app).post(`/api/v1/practitioner/${id}/activate`).set("Authorization", `Bearer ${admin.token}`);
    expect(first.status).toBe(200);

    const log = await request(app).get(`/api/v1/practitioner/${id}/email-sends`).set("Authorization", `Bearer ${admin.token}`);
    expect(log.status).toBe(200);
    expect(log.body.sends).toHaveLength(1);
    expect(log.body.sends[0]).toMatchObject({ kind: "partner_invite", status: "sent", sent_by_name: "QA Sender" });
    expect(log.body.sends[0].sent_to_masked).not.toContain("qa-esend-hcp");
    expect(log.body.cooldownSeconds).toBeGreaterThan(INVITE_COOLDOWN_SECONDS - 30);

    const again = await request(app).post(`/api/v1/practitioner/${id}/activate`).set("Authorization", `Bearer ${admin.token}`);
    expect(again.status).toBe(429);
    expect(again.body.code).toBe("TOO_MANY_REQUESTS");
    expect(again.body.retryAfter).toBeGreaterThan(0);
    expect(sendPartnerInviteEmailMock).toHaveBeenCalledTimes(1);
  }, 20000);

  it("does not show another practitioner's sends", async () => {
    sendPartnerInviteEmailMock.mockResolvedValueOnce(`msg-${uniqueSuffix()}`);
    const admin = await makeUser("admin");
    const sentId = await makePractitioner();
    const otherId = await makePractitioner();
    await request(app).post(`/api/v1/practitioner/${sentId}/activate`).set("Authorization", `Bearer ${admin.token}`);

    const log = await request(app).get(`/api/v1/practitioner/${otherId}/email-sends`).set("Authorization", `Bearer ${admin.token}`);
    expect(log.status).toBe(200);
    expect(log.body.sends).toEqual([]);
    expect(log.body.cooldownSeconds).toBe(0);
  }, 20000);

  it("keeps the furthest status when webhooks arrive out of order", async () => {
    const messageId = `msg-${uniqueSuffix()}`;
    sendPartnerInviteEmailMock.mockResolvedValueOnce(messageId);
    const admin = await makeUser("admin");
    const id = await makePractitioner();
    await request(app).post(`/api/v1/practitioner/${id}/activate`).set("Authorization", `Bearer ${admin.token}`);

    await withTenant(TENANT_SLUG, async (client) => {
      await applyEmailStatus(client, messageId, "delivered", null, new Date());
      await applyEmailStatus(client, messageId, "delayed", null, new Date());
    });

    const log = await request(app).get(`/api/v1/practitioner/${id}/email-sends`).set("Authorization", `Bearer ${admin.token}`);
    expect(log.body.sends[0].status).toBe("delivered");
  }, 20000);
});
