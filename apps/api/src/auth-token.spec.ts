import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "./server.js";
import { withTenant, insertStaffUser } from "./db.js";

// Regression test for the incident this replaces: pwa.neosleepcare.com (frontend) and the
// Render API (backend) are different origins, and Safari/iOS blocks third-party cookies by
// default — a SameSite=None session cookie never reliably persisted there, so a correctly
// logged-in user could see no real session data on iPhone (desktop worked fine). Auth moved
// to a bearer JWT returned in the response body instead of a cookie — this file asserts that
// cutover actually happened: no Set-Cookie header anywhere in the auth flow, and the token
// itself carries the expiry that used to live on the cookie's maxAge/remember-me window.

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const TEST_PASSWORD = "correct-horse-battery-staple";

async function createLoginUser(email: string): Promise<void> {
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);
  await withTenant(TENANT_SLUG, (client) =>
    insertStaffUser(client, email, "QA", "Token", "rep", hash, false),
  );
}

function testEmail(label: string): string {
  return `qa-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
}

function decodeJwt(token: string): { iat: number; exp: number } {
  const payload = token.split(".")[1]!;
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  return JSON.parse(json);
}

describe("Bearer-token auth (no cookies)", () => {
  it("login never sets a Set-Cookie header", async () => {
    const email = testEmail("no-cookie");
    await createLoginUser(email);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "10.40.0.1")
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("token expiry is ~7 days without remember_me", async () => {
    const email = testEmail("expiry-default");
    await createLoginUser(email);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "10.40.0.2")
      .send({ email, password: TEST_PASSWORD });

    const { iat, exp } = decodeJwt(res.body.token);
    const days = (exp - iat) / (60 * 60 * 24);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("token expiry is ~30 days with remember_me: true", async () => {
    const email = testEmail("expiry-remember");
    await createLoginUser(email);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "10.40.0.3")
      .send({ email, password: TEST_PASSWORD, remember_me: true });

    const { iat, exp } = decodeJwt(res.body.token);
    const days = (exp - iat) / (60 * 60 * 24);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("protected routes ignore any cookie and require the Authorization header instead", async () => {
    // Simulates exactly the bug this replaced: a client that only has an old-style
    // cookie (no Authorization header) must NOT be treated as authenticated.
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set("X-Forwarded-For", "10.40.0.4")
      .set("Cookie", "connect.sid=s%3Aforged-legacy-session-id.signature");
    expect(res.status).toBe(401);
  });
});
