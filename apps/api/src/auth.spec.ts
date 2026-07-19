import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "./server.js";
import { withTenant, insertStaffUser } from "./db.js";

// Single-tenant stage — tenant isolation is intentionally out of scope here.
// TODO(multi-tenant): once a second tenant schema is live, add a test proving
// a session created under tenant A cannot read/act on tenant B's data.
//
// No audit_log assertions: insertAuditLog() (apps/api/src/db/audit-log.ts) is
// used exclusively for FHIR-entity mutations (lead/practitioner/encounter/...)
// in every route across this codebase — auth events (login/logout/password
// change) were never part of that convention, so there's nothing to assert.

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
const TEST_PASSWORD = "correct-horse-battery-staple";

let ipSeq = 0;
/** Gives each test its own X-Forwarded-For address so the shared, in-memory
 *  express-rate-limit buckets (keyed by req.ip; trust proxy is on — see
 *  server.ts) don't leak between unrelated tests in this file. */
function freshIp(): string {
  ipSeq += 1;
  return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
}

/** Unique per test run so re-running this file against a non-fresh local DB
 *  (container not recreated between runs) never collides with a previous
 *  run's row via insertStaffUser's ON CONFLICT (identity_id) DO NOTHING. */
function testEmail(label: string): string {
  return `qa-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
}

async function createLoginUser(
  email: string,
  opts: { password?: string; forcePasswordChange?: boolean } = {},
): Promise<void> {
  const hash = await bcrypt.hash(opts.password ?? TEST_PASSWORD, 4);
  await withTenant(TENANT_SLUG, (client) =>
    insertStaffUser(client, email, "QA Pilot", "rep", hash, opts.forcePasswordChange ?? false),
  );
}

describe("Auth routes", () => {
  const email = testEmail("login");

  beforeAll(async () => {
    await createLoginUser(email);
  });

  describe("POST /api/v1/auth/login", () => {
    it("400s when email is missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ password: TEST_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("400s when password is missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("400s when password is under 8 characters, with the same generic message used for invalid credentials", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email, password: "short" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid email or password.");
    });

    it("401s for an unknown email with the generic message", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email: testEmail("nobody"), password: TEST_PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid email or password.");
    });

    it("401s for a wrong password with the identical generic message (no info leak vs. unknown email)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email, password: "totally-wrong-password" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid email or password.");
    });

    it("200s, sets a session cookie, and returns the user on success", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email, password: TEST_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ email });
      const cookies = (res.headers["set-cookie"] as unknown as string[]) ?? [];
      expect(cookies.some((c) => c.startsWith("connect.sid="))).toBe(true);
    });

    it("also sets a separate httpOnly remember-me cookie when remember_me is true", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email, password: TEST_PASSWORD, remember_me: true });
      expect(res.status).toBe(200);
      const cookies = (res.headers["set-cookie"] as unknown as string[]) ?? [];
      expect(cookies.some((c) => c.startsWith("connect.sid="))).toBe(true);
      const rememberCookie = cookies.find((c) => c.startsWith("remember_me="));
      expect(rememberCookie).toBeTruthy();
      expect(rememberCookie).toMatch(/HttpOnly/i);
    });

    it("eventually 429s after repeated attempts from the same client", async () => {
      const ip = freshIp();
      let sawTooMany = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post("/api/v1/auth/login")
          .set("X-Forwarded-For", ip)
          .send({ email, password: "wrong-password-for-rate-limit-test" });
        if (res.status === 429) {
          sawTooMany = true;
          break;
        }
      }
      expect(sawTooMany).toBe(true);
    });
  });

  describe("GET /api/v1/auth/session", () => {
    it("401s without a session", async () => {
      const res = await request(app).get("/api/v1/auth/session").set("X-Forwarded-For", freshIp());
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });

    it("200s with the user shape when a valid session cookie is presented", async () => {
      const agent = request.agent(app);
      const ip = freshIp();
      const loginRes = await agent
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);

      const res = await agent.get("/api/v1/auth/session").set("X-Forwarded-For", ip);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ email });
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("clears the session (subsequent /auth/session 401s), clears the remember-me cookie, and returns 204", async () => {
      const agent = request.agent(app);
      const ip = freshIp();
      await agent
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email, password: TEST_PASSWORD, remember_me: true });

      const logoutRes = await agent.post("/api/v1/auth/logout").set("X-Forwarded-For", ip);
      expect(logoutRes.status).toBe(204);
      const cookies = (logoutRes.headers["set-cookie"] as unknown as string[]) ?? [];
      const rememberCookie = cookies.find((c) => c.startsWith("remember_me="));
      expect(rememberCookie).toBeTruthy();
      expect(rememberCookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);

      const sessionRes = await agent.get("/api/v1/auth/session").set("X-Forwarded-For", ip);
      expect(sessionRes.status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/change-password", () => {
    it("401s without a session", async () => {
      const res = await request(app)
        .post("/api/v1/auth/change-password")
        .set("X-Forwarded-For", freshIp())
        .send({ current_password: TEST_PASSWORD, new_password: "a-new-long-password" });
      expect(res.status).toBe(401);
    });

    it("400s when the new password is under 8 characters", async () => {
      const changeEmail = testEmail("change-short");
      await createLoginUser(changeEmail);
      const agent = request.agent(app);
      const ip = freshIp();
      await agent.post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ email: changeEmail, password: TEST_PASSWORD });

      const res = await agent
        .post("/api/v1/auth/change-password")
        .set("X-Forwarded-For", ip)
        .send({ current_password: TEST_PASSWORD, new_password: "short" });
      expect(res.status).toBe(400);
    });

    it("401s when the current password is wrong", async () => {
      const changeEmail = testEmail("change-wrong-current");
      await createLoginUser(changeEmail);
      const agent = request.agent(app);
      const ip = freshIp();
      await agent.post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ email: changeEmail, password: TEST_PASSWORD });

      const res = await agent
        .post("/api/v1/auth/change-password")
        .set("X-Forwarded-For", ip)
        .send({ current_password: "not-the-current-password", new_password: "a-new-long-password" });
      expect(res.status).toBe(401);
    });

    it("200s on success and clears force_password_change", async () => {
      const changeEmail = testEmail("change-success");
      await createLoginUser(changeEmail, { forcePasswordChange: true });
      const agent = request.agent(app);
      const ip = freshIp();
      const loginRes = await agent
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email: changeEmail, password: TEST_PASSWORD });
      expect(loginRes.body.forcePasswordChange).toBe(true);

      const res = await agent
        .post("/api/v1/auth/change-password")
        .set("X-Forwarded-For", ip)
        .send({ current_password: TEST_PASSWORD, new_password: "brand-new-password-please" });
      expect(res.status).toBe(200);

      const sessionRes = await agent.get("/api/v1/auth/session").set("X-Forwarded-For", ip);
      expect(sessionRes.body.user.forcePasswordChange).toBe(false);
    });
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("always 200s with the same generic message, whether or not the email exists", async () => {
      const existingRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .set("X-Forwarded-For", freshIp())
        .send({ email });
      const missingRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .set("X-Forwarded-For", freshIp())
        .send({ email: testEmail("never-registered") });

      expect(existingRes.status).toBe(200);
      expect(missingRes.status).toBe(200);
      expect(existingRes.body.message).toBe(missingRes.body.message);
      // NOTE: outside production, the existing-account branch also returns a
      // devResetLink field (see auth.ts) that the missing-account branch never
      // has — a dev/test convenience for driving the reset flow below without
      // real email delivery. The anti-enumeration guarantee is therefore only
      // fully closed in production (NODE_ENV=production strips devResetLink);
      // here we only assert the two `message` texts are identical.
    });
  });

  describe("GET /api/v1/auth/reset-password/validate and POST /api/v1/auth/reset-password", () => {
    it("reports a freshly issued token as valid and a made-up token as invalid", async () => {
      const forgotRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .set("X-Forwarded-For", freshIp())
        .send({ email });
      const token = new URL(forgotRes.body.devResetLink).searchParams.get("token")!;

      const validRes = await request(app)
        .get(`/api/v1/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
        .set("X-Forwarded-For", freshIp());
      expect(validRes.body).toEqual({ valid: true });

      const invalidRes = await request(app)
        .get("/api/v1/auth/reset-password/validate?token=not-a-real-token")
        .set("X-Forwarded-For", freshIp());
      expect(invalidRes.body).toEqual({ valid: false });
    });

    it("resets the password with a valid token, is single-use, and 400s a too-short new password", async () => {
      const resetEmail = testEmail("reset-flow");
      await createLoginUser(resetEmail);

      const forgotRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .set("X-Forwarded-For", freshIp())
        .send({ email: resetEmail });
      const token = new URL(forgotRes.body.devResetLink).searchParams.get("token")!;

      const shortRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .set("X-Forwarded-For", freshIp())
        .send({ token, new_password: "short" });
      expect(shortRes.status).toBe(400);

      const resetRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .set("X-Forwarded-For", freshIp())
        .send({ token, new_password: "brand-new-reset-password" });
      expect(resetRes.status).toBe(200);

      const replayRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .set("X-Forwarded-For", freshIp())
        .send({ token, new_password: "yet-another-password-1" });
      expect(replayRes.status).toBe(400);

      const loginNew = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email: resetEmail, password: "brand-new-reset-password" });
      expect(loginNew.status).toBe(200);

      const loginOld = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", freshIp())
        .send({ email: resetEmail, password: TEST_PASSWORD });
      expect(loginOld.status).toBe(401);
    });

    it("400s a reset attempt with an invalid/expired token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .set("X-Forwarded-For", freshIp())
        .send({ token: "not-a-real-token", new_password: "irrelevant-but-long-enough" });
      expect(res.status).toBe(400);
    });
  });
});
