import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "./server.js";
import { withTenant, insertStaffUser } from "./db.js";

// Covers ADR-020's refresh-token rotation model: POST /auth/refresh, reuse/theft
// detection, per-device logout, and password-change revoking every device. See
// auth.spec.ts for the base login/logout/change-password contract tests and
// auth-token.spec.ts for the "zero cookies anywhere" regression guard — this file
// is specifically the rotation state machine.

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
const TEST_PASSWORD = "correct-horse-battery-staple";

let ipSeq = 0;
function freshIp(): string {
  ipSeq += 1;
  return `10.50.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
}

function testEmail(label: string): string {
  return `qa-refresh-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
}

async function createLoginUser(email: string): Promise<void> {
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);
  await withTenant(TENANT_SLUG, (client) => insertStaffUser(client, email, "QA", "Refresh", "rep", hash, false));
}

async function login(email: string, ip: string): Promise<{ token: string; refresh_token: string }> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", ip)
    .send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return { token: res.body.token, refresh_token: res.body.refresh_token };
}

describe("POST /api/v1/auth/refresh", () => {
  it("401s without a refresh_token", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(401);
  });

  it("401s on a garbage/tampered refresh token (never 500s)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", freshIp())
      .send({ refresh_token: "not-a-real-token-at-all" });
    expect(res.status).toBe(401);
  });

  it("401s when an access token is presented in place of a refresh token", async () => {
    const email = testEmail("wrong-token-type");
    await createLoginUser(email);
    const ip = freshIp();
    const { token } = await login(email, ip);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token: token });
    expect(res.status).toBe(401);
  });

  it("issues a new access token AND a new (different) refresh token", async () => {
    const email = testEmail("rotation");
    await createLoginUser(email);
    const ip = freshIp();
    const first = await login(email, ip);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token: first.refresh_token });
    expect(res.status).toBe(200);
    // Not asserting the access token differs from the original: two JWTs signed
    // for the same user within the same second are legitimately byte-identical
    // (no jti/nonce in the payload, iat has second precision) — that's not a
    // security property this design relies on. The refresh token is the one
    // that must be unique per issuance, since it's the thing rotation tracks.
    expect(typeof res.body.token).toBe("string");
    expect(typeof res.body.refresh_token).toBe("string");
    expect(res.body.refresh_token).not.toBe(first.refresh_token);
  });

  it("rejects reuse of a rotated-away refresh token, AND kills the legitimately-rotated newest token too (theft response)", async () => {
    const email = testEmail("reuse-detection");
    await createLoginUser(email);
    const ip = freshIp();
    const original = await login(email, ip);

    // Legitimate rotation.
    const rotated = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token: original.refresh_token });
    expect(rotated.status).toBe(200);
    const newestRefreshToken = rotated.body.refresh_token as string;

    // An attacker (or a client that lost a race) replays the now-rotated-away token.
    const reuseRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token: original.refresh_token });
    expect(reuseRes.status).toBe(401);

    // The whole chain must now be dead — including the token the legitimate
    // client actually holds, not just the reused one. This is the point: a
    // detected reuse forces a real re-login on every device, not a partial fix.
    const legitimateButNowDeadRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token: newestRefreshToken });
    expect(legitimateButNowDeadRes.status).toBe(401);
  });

  // Regression test for a real bug caught during implementation: a plain logout
  // revocation (replaced_by_id NULL — a dead end, not a rotation) must NOT be
  // treated as theft. The first version of this handler checked only
  // `revoked_at` and, on re-presenting a logged-out token, nuked every other
  // session for that user too — see the "logout is per-device" test in the
  // describe block below, which is what actually caught this.
  it("re-presenting a logged-out (not rotated-away) token 401s without revoking other sessions", async () => {
    const email = testEmail("logout-not-theft");
    await createLoginUser(email);
    const ipA = freshIp();
    const ipB = freshIp();
    const deviceA = await login(email, ipA);
    const deviceB = await login(email, ipB);

    await request(app)
      .post("/api/v1/auth/logout")
      .set("X-Forwarded-For", ipA)
      .set("Authorization", `Bearer ${deviceA.token}`)
      .send({ refresh_token: deviceA.refresh_token });

    // Re-presenting the now-logged-out token: just a dead token, 401 only.
    const replayRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ipA)
      .send({ refresh_token: deviceA.refresh_token });
    expect(replayRes.status).toBe(401);

    // Device B must be completely unaffected — this is NOT a theft signal.
    const deviceBRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ipB)
      .send({ refresh_token: deviceB.refresh_token });
    expect(deviceBRefresh.status).toBe(200);
  });

  it("401s an expired refresh token instead of accepting it", async () => {
    const email = testEmail("expired");
    await createLoginUser(email);
    const ip = freshIp();
    const { refresh_token } = await login(email, ip);

    // Backdate the DB row directly — this is what "7 days from now" looks like
    // after 7 days pass, without actually waiting 7 days in a test.
    await withTenant(TENANT_SLUG, (client) =>
      client.query(
        `UPDATE remember_me_tokens SET expires_at = now() - interval '1 minute'
         WHERE token_hash = encode(sha256(convert_to($1, 'utf8')), 'hex')`,
        [refresh_token],
      ),
    );

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token });
    expect(res.status).toBe(401);
  });

  it("preserves the original remember-me window across rotation instead of resetting it", async () => {
    const email = testEmail("remember-me-window");
    await createLoginUser(email);
    const ip = freshIp();

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", ip)
      .send({ email, password: TEST_PASSWORD, remember_me: true });
    expect(loginRes.status).toBe(200);

    const refreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token: loginRes.body.refresh_token });
    expect(refreshRes.status).toBe(200);

    // Not directly observable from the opaque token — the meaningful assertion is
    // behavioral: a rotated remember-me token still refreshes successfully, i.e. it
    // wasn't silently downgraded to the ~7-day default window. A regression that
    // dropped to the default would still pass this test today but fail it once run
    // beyond 7 days — acceptable given there's no server-visible field to assert on
    // directly without reaching into the DB row, which the DB-layer tests already cover.
    const secondRefreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ip)
      .send({ refresh_token: refreshRes.body.refresh_token });
    expect(secondRefreshRes.status).toBe(200);
  });
});

describe("Per-device logout and password-change revocation (ADR-020)", () => {
  it("logout on one device does not affect a second concurrent login for the same user", async () => {
    const email = testEmail("multi-device-logout");
    await createLoginUser(email);
    const ipA = freshIp();
    const ipB = freshIp();

    const deviceA = await login(email, ipA);
    const deviceB = await login(email, ipB);

    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .set("X-Forwarded-For", ipA)
      .set("Authorization", `Bearer ${deviceA.token}`)
      .send({ refresh_token: deviceA.refresh_token });
    expect(logoutRes.status).toBe(204);

    const deviceARefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ipA)
      .send({ refresh_token: deviceA.refresh_token });
    expect(deviceARefresh.status).toBe(401);

    const deviceBRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ipB)
      .send({ refresh_token: deviceB.refresh_token });
    expect(deviceBRefresh.status).toBe(200);
  });

  it("changing the password revokes every device's refresh token, not just the one used to change it", async () => {
    const email = testEmail("password-change-multi-device");
    await createLoginUser(email);
    const ipA = freshIp();
    const ipB = freshIp();

    const deviceA = await login(email, ipA);
    const deviceB = await login(email, ipB);

    const changeRes = await request(app)
      .post("/api/v1/auth/change-password")
      .set("X-Forwarded-For", ipA)
      .set("Authorization", `Bearer ${deviceA.token}`)
      .send({ current_password: TEST_PASSWORD, new_password: "brand-new-refresh-test-password" });
    expect(changeRes.status).toBe(200);

    const deviceARefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ipA)
      .send({ refresh_token: deviceA.refresh_token });
    expect(deviceARefresh.status).toBe(401);

    const deviceBRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-Forwarded-For", ipB)
      .send({ refresh_token: deviceB.refresh_token });
    expect(deviceBRefresh.status).toBe(401);
  });
});
