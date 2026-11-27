import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";

// Resend is the external boundary — mocked; Postgres and the Express stack are real.
const { sendAccountCreatedEmailMock } = vi.hoisted(() => ({
  sendAccountCreatedEmailMock: vi.fn(),
}));
vi.mock("../mailer.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mailer.js")>()),
  sendAccountCreatedEmail: sendAccountCreatedEmailMock,
}));

import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * CORE-199: creating a staff user issues one set-password token (7 days) and
 * sends one welcome email; a mail failure never rolls the user back.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminAuth(): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-core199-admin-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant", 4);
    const admin = await insertStaffUser(client, email, "Ana", "Admin", "admin", hash, false);
    return `Bearer ${signAuthToken({ id: admin!.id, email, role: "admin", token_version: 0 })}`;
  });
}

async function tokensFor(userId: string): Promise<{ expires_at: Date }[]> {
  return withTenant(TENANT_SLUG, async (client) => {
    const r = await client.query<{ expires_at: Date }>(`SELECT expires_at FROM password_reset_tokens WHERE user_id = $1`, [userId]);
    return r.rows;
  });
}

async function auditActions(userId: string): Promise<string[]> {
  return withTenant(TENANT_SLUG, async (client) => {
    const r = await client.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'User' AND entity_id = $1 ORDER BY created_at`,
      [userId]
    );
    return r.rows.map((row) => row.action);
  });
}

beforeEach(() => {
  sendAccountCreatedEmailMock.mockReset();
  sendAccountCreatedEmailMock.mockImplementation(async () => `msg-${randomUUID()}`);
});

describe("POST /api/v1/users — welcome email", () => {
  it("writes one 7-day set-password token and sends one email in the user's locale", async () => {
    const auth = await adminAuth();
    const email = `qa-core199-ok-${uniqueSuffix()}@neosleepcare.com`;
    const before = Date.now();

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", auth)
      .send({ first_name: "Pola", last_name: "Rep", email, role: "rep", country_code: "PL" });

    expect(res.status).toBe(201);
    expect(res.body.invite_email).toBe("sent");

    const tokens = await tokensFor(res.body.id as string);
    expect(tokens).toHaveLength(1);
    const lifetime = tokens[0]!.expires_at.getTime() - before;
    expect(lifetime).toBeGreaterThan(SEVEN_DAYS_MS - 60_000);
    expect(lifetime).toBeLessThan(SEVEN_DAYS_MS + 60_000);

    expect(sendAccountCreatedEmailMock).toHaveBeenCalledTimes(1);
    const [to, link, recipient, context] = sendAccountCreatedEmailMock.mock.calls[0]!;
    expect(to).toBe(email);
    expect(link).toMatch(/\/reset-password\?token=[0-9a-f]{64}$/);
    expect(recipient).toMatchObject({ firstName: "Pola", lastName: "Rep", region: "PL" });
    expect(context.inviterName).toBeTruthy();
    expect(context.tenantName).toBeTruthy();

    expect(await auditActions(res.body.id as string)).toEqual(["create", "invite_sent"]);
  }, 15000);

  it("the emailed token is a valid set-password token", async () => {
    const auth = await adminAuth();
    const email = `qa-core199-valid-${uniqueSuffix()}@neosleepcare.com`;

    const res = await request(app).post("/api/v1/users").set("Authorization", auth).send({ first_name: "Val", last_name: "Id", email });
    expect(res.status).toBe(201);

    const link = sendAccountCreatedEmailMock.mock.calls[0]![1] as string;
    const token = new URL(link).searchParams.get("token")!;
    const check = await request(app).get("/api/v1/auth/reset-password/validate").query({ token });
    expect(check.body).toEqual({ valid: true });
  }, 15000);

  it("a mailer failure still returns 201 with not_sent and keeps the user", async () => {
    sendAccountCreatedEmailMock.mockRejectedValue(new Error("Resend is down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = await adminAuth();
    const email = `qa-core199-fail-${uniqueSuffix()}@neosleepcare.com`;

    const res = await request(app).post("/api/v1/users").set("Authorization", auth).send({ first_name: "Fail", last_name: "Mail", email });
    errSpy.mockRestore();

    expect(res.status).toBe(201);
    expect(res.body.invite_email).toBe("not_sent");
    const got = await request(app).get(`/api/v1/users/${res.body.id as string}`).set("Authorization", auth);
    expect(got.status).toBe(200);
    expect(got.body.email).toBe(email);
    expect(await auditActions(res.body.id as string)).toEqual(["create"]);
  }, 15000);

  it("reports not_sent when Resend is not configured (mailer returns null)", async () => {
    sendAccountCreatedEmailMock.mockResolvedValue(null);
    const auth = await adminAuth();

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", auth)
      .send({ first_name: "No", last_name: "Config", email: `qa-core199-null-${uniqueSuffix()}@neosleepcare.com` });

    expect(res.status).toBe(201);
    expect(res.body.invite_email).toBe("not_sent");
  }, 15000);
});
