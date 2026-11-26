import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { withTenant, insertStaffUser } from "./db.js";
import bcrypt from "bcrypt";

// One Render BFF instance serves multiple frontends (pwa.neosleepcare.com prod +
// pwa-dev.neosleepcare.com dev) — FRONTEND_URL is a comma-separated list there (see
// server.ts's CORS config). Regression test for a real production bug: a reset-password
// link built by interpolating the raw FRONTEND_URL string came out as
// "https://a.com,https://b.com/reset-password?token=..." — both origins concatenated,
// not a valid URL. CI never catches this on its own because it never sets FRONTEND_URL
// to more than one value (defaults to a single localhost origin) — this test forces that
// multi-origin case. env.ts's FRONTEND_URLS (and auth.ts's DEFAULT_FRONTEND_ORIGIN /
// resolveFrontendOrigin, which read it) are computed once at module load, so — same
// pattern as auth-session-cookie.spec.ts — each case needs a fresh module instance via
// vi.resetModules() + dynamic import, not just mutating process.env on an already-loaded app.

const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const TEST_PASSWORD = "correct-horse-battery-staple";
const PROD_ORIGIN = "https://pwa.neosleepcare.com";
const DEV_ORIGIN = "https://pwa-dev.neosleepcare.com";

afterEach(() => {
  process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
});

async function freshApp(frontendUrl: string): Promise<import("express").Express> {
  process.env.FRONTEND_URL = frontendUrl;
  vi.resetModules();
  const { app } = await import("./server.js");
  return app;
}

async function createLoginUser(email: string): Promise<void> {
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);
  await withTenant(TENANT_SLUG, (client) =>
    insertStaffUser(client, email, "QA", "Origin", "rep", hash, false),
  );
}

function testEmail(label: string): string {
  return `qa-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
}

describe("Reset-password link with a multi-origin FRONTEND_URL", () => {
  it("never concatenates both origins into one broken URL", async () => {
    const email = testEmail("frontend-origin-multi");
    const app = await freshApp(`${PROD_ORIGIN},${DEV_ORIGIN}`);
    await createLoginUser(email);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("X-Forwarded-For", "10.30.0.1")
      .send({ email });

    expect(res.status).toBe(200);
    expect(res.body.devResetLink).toBeTruthy();
    // The bug: naively interpolating FRONTEND_URL produced exactly this — both origins,
    // comma-joined, before the path. Assert it's gone, not just that *a* link exists.
    expect(res.body.devResetLink as string).not.toContain(",");
    expect(() => new URL(res.body.devResetLink)).not.toThrow();
  });

  it("uses the requesting origin when it matches one of the allowed frontends", async () => {
    const email = testEmail("frontend-origin-dev");
    const app = await freshApp(`${PROD_ORIGIN},${DEV_ORIGIN}`);
    await createLoginUser(email);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("X-Forwarded-For", "10.30.0.2")
      .set("Origin", DEV_ORIGIN)
      .send({ email });

    expect(res.status).toBe(200);
    expect(res.body.devResetLink as string).toMatch(new RegExp(`^${DEV_ORIGIN}/reset-password\\?`));
  });

  it("falls back to the first configured origin when Origin doesn't match either", async () => {
    const email = testEmail("frontend-origin-fallback");
    const app = await freshApp(`${PROD_ORIGIN},${DEV_ORIGIN}`);
    await createLoginUser(email);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("X-Forwarded-For", "10.30.0.3")
      .send({ email }); // no Origin header — same as a server-to-server or non-browser call

    expect(res.status).toBe(200);
    expect(res.body.devResetLink as string).toMatch(new RegExp(`^${PROD_ORIGIN}/reset-password\\?`));
  });
});
