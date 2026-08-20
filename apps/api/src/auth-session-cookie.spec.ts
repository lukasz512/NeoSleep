import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "./db.js";

// The PWA and API are served from different origins in production
// (pwa.neosleepcare.com vs. the Render API host), so the session cookie must be
// SameSite=None; Secure there — "lax" is never attached to the cross-site
// fetch/XHR calls the SPA makes after login, which silently drops the user back
// to an unauthenticated state (see incident: login succeeded but /session and
// /unread-count 401ed immediately after, and the UI fell back to placeholder
// user data). Dev/CI stay on "lax" because the Vite proxy keeps requests
// same-origin there, and "none" requires secure:true (HTTPS), which local dev
// doesn't have.
//
// server.ts reads process.env.NODE_ENV once, at module-load time, when it
// builds the session() middleware config — so each case here forces a fresh
// module instance via vi.resetModules() + dynamic import rather than mutating
// state on the already-imported app. NODE_ENV is left as set until afterEach
// restores it, because the remember-me cookie (auth.ts) re-reads it per-request,
// not at import time — reverting too early would test the wrong branch there.
//
// Render terminates TLS and forwards `X-Forwarded-Proto: https` to the app —
// combined with `app.set("trust proxy", 1)` in server.ts, that's what makes
// `req.secure` true for real production traffic. Requests here set that header
// to reproduce it; without it, a "production" cookie config still won't be
// sent at all (express-session silently drops `secure: true` cookies over a
// connection it can't tell is HTTPS).

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const TEST_PASSWORD = "correct-horse-battery-staple";

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

async function freshApp(nodeEnv: string): Promise<import("express").Express> {
  process.env.NODE_ENV = nodeEnv;
  vi.resetModules();
  const { app } = await import("./server.js");
  return app;
}

async function createLoginUser(email: string): Promise<void> {
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);
  await withTenant(TENANT_SLUG, (client) =>
    insertStaffUser(client, email, "QA", "Cookie", "rep", hash, false),
  );
}

function testEmail(label: string): string {
  return `qa-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
}

describe("Session cookie SameSite/Secure attributes", () => {
  it("is SameSite=None; Secure in production (cross-site PWA -> API)", async () => {
    const email = testEmail("cookie-prod");
    await createLoginUser(email);
    const app = await freshApp("production");

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "10.20.30.1")
      .set("X-Forwarded-Proto", "https")
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const cookies = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    const sessionCookie = cookies.find((c) => c.startsWith("connect.sid="));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie).toMatch(/SameSite=None/i);
    expect(sessionCookie).toMatch(/Secure/i);
  });

  it("stays SameSite=Lax without Secure outside production (same-origin dev proxy)", async () => {
    const email = testEmail("cookie-dev");
    await createLoginUser(email);
    const app = await freshApp("development");

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "10.20.30.2")
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const cookies = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    const sessionCookie = cookies.find((c) => c.startsWith("connect.sid="));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).not.toMatch(/Secure/i);
  });

  it("also flips the remember-me cookie to SameSite=None; Secure in production", async () => {
    const email = testEmail("remember-prod");
    await createLoginUser(email);
    const app = await freshApp("production");

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "10.20.30.3")
      .set("X-Forwarded-Proto", "https")
      .send({ email, password: TEST_PASSWORD, remember_me: true });

    expect(res.status).toBe(200);
    const cookies = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    const rememberCookie = cookies.find((c) => c.startsWith("remember_me="));
    expect(rememberCookie).toBeTruthy();
    expect(rememberCookie).toMatch(/SameSite=None/i);
    expect(rememberCookie).toMatch(/Secure/i);
  });
});
