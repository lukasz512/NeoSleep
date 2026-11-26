import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { withTenant, insertStaffUser } from "./db.js";

// "Sign in with Google" (NEO-78). Real Postgres throughout (CLAUDE.md rule 5);
// only Google itself, the external HTTP boundary, is faked: its token and
// userinfo endpoints are answered by a fetch stub below, the same way
// orthoapnea/googleCalendar specs stub their third-party boundaries.
//
// auth.ts reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / FRONTEND_URL once at
// module load, so each configuration needs a fresh module instance
// (vi.resetModules() + dynamic import), same pattern as auth-frontend-origin.spec.ts.

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const PROD_ORIGIN = "https://pwa.neosleepcare.com";
const DEV_ORIGIN = "https://pwa-dev.neosleepcare.com";
const ORIGINAL_ENV = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  FRONTEND_URL: process.env.FRONTEND_URL,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function freshApp(opts: { google: boolean }): Promise<Express> {
  if (opts.google) {
    process.env.GOOGLE_CLIENT_ID = "qa-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "qa-client-secret";
  } else {
    process.env.GOOGLE_CLIENT_ID = "";
    process.env.GOOGLE_CLIENT_SECRET = "";
  }
  process.env.FRONTEND_URL = `${PROD_ORIGIN},${DEV_ORIGIN}`;
  vi.resetModules();
  const { app } = await import("./server.js");
  return app;
}

function unique(label: string): string {
  return `qa-google-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** What Google's userinfo endpoint answers for the next callback. */
let googleProfile: { sub: string; email: string; email_verified: boolean } = {
  sub: "",
  email: "",
  email_verified: true,
};

const realFetch = globalThis.fetch;
function stubGoogle(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "qa-google-access-token" }), { status: 200 });
    }
    if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) {
      return new Response(JSON.stringify(googleProfile), { status: 200 });
    }
    return realFetch(input, init);
  });
}

/** Starts the flow like the button does and returns the signed `state` Google would echo back. */
async function startFlow(app: Express, origin = DEV_ORIGIN): Promise<string> {
  const res = await request(app).get(`/api/v1/auth/google?origin=${encodeURIComponent(origin)}`);
  expect(res.status).toBe(302);
  const state = new URL(res.headers.location as string).searchParams.get("state");
  expect(state).toBeTruthy();
  return state!;
}

async function callback(app: Express): Promise<URL> {
  const state = await startFlow(app);
  const res = await request(app).get(
    `/api/v1/auth/google/callback?code=qa-auth-code&state=${encodeURIComponent(state)}`,
  );
  expect(res.status).toBe(302);
  return new URL(res.headers.location as string);
}

async function createUser(email: string): Promise<string> {
  const user = await withTenant(TENANT_SLUG, (client) =>
    insertStaffUser(client, email, "QA", "Google", "rep", null, false),
  );
  return user!.id;
}

async function readUser(email: string): Promise<{ id: string; google_sub: string | null } | null> {
  return withTenant(TENANT_SLUG, async (client) => {
    const r = await client.query<{ id: string; google_sub: string | null }>(
      `SELECT u.id, u.google_sub FROM users u JOIN identities i ON i.id = u.identity_id WHERE i.email = $1`,
      [email],
    );
    return r.rows[0] ?? null;
  });
}

async function setStatus(userId: string, status: "active" | "inactive" | "suspended"): Promise<void> {
  await withTenant(TENANT_SLUG, (client) =>
    client.query(`UPDATE users SET status = $1 WHERE id = $2`, [status, userId]),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  restoreEnv();
});

describe("GET /api/v1/auth/providers", () => {
  it("reports google: false when the environment has no Google OAuth client", async () => {
    const app = await freshApp({ google: false });
    const res = await request(app).get("/api/v1/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: false });
  });

  it("reports google: true when client id and secret are both set, without leaking them", async () => {
    const app = await freshApp({ google: true });
    const res = await request(app).get("/api/v1/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: true });
    expect(JSON.stringify(res.body)).not.toContain("qa-client");
  });
});

describe("GET /api/v1/auth/google", () => {
  it("503s when Google login is not configured", async () => {
    const app = await freshApp({ google: false });
    const res = await request(app).get("/api/v1/auth/google");
    expect(res.status).toBe(503);
  });

  it("redirects to Google's account chooser and carries an allowlisted ?origin= in the signed state", async () => {
    const app = await freshApp({ google: true });
    const { verifyOAuthState } = await import("./utils/oauthTokens.js");
    const res = await request(app).get(`/api/v1/auth/google?origin=${encodeURIComponent(DEV_ORIGIN)}`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("prompt")).toBe("select_account");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(verifyOAuthState(location.searchParams.get("state")!)).toBe(DEV_ORIGIN);
  });

  it("ignores an ?origin= outside the FRONTEND_URL allowlist (no open redirect)", async () => {
    const app = await freshApp({ google: true });
    const { verifyOAuthState } = await import("./utils/oauthTokens.js");
    const res = await request(app).get(`/api/v1/auth/google?origin=${encodeURIComponent("https://evil.example.com")}`);
    const state = new URL(res.headers.location as string).searchParams.get("state")!;
    expect(verifyOAuthState(state)).toBe(PROD_ORIGIN);
  });
});

describe("GET /api/v1/auth/google/callback — only existing accounts may sign in", () => {
  let app: Express;

  beforeAll(async () => {
    app = await freshApp({ google: true });
  });

  it("signs in an existing active user, links the Google sub, and the exchange returns a real token", async () => {
    stubGoogle();
    const email = `${unique("known")}@neosleepcare.com`;
    await createUser(email);
    googleProfile = { sub: unique("sub"), email, email_verified: true };

    const location = await callback(app);
    expect(location.origin).toBe(DEV_ORIGIN);
    expect(location.pathname).toBe("/auth/callback");
    const code = location.searchParams.get("code");
    expect(code).toBeTruthy();
    expect((await readUser(email))?.google_sub).toBe(googleProfile.sub);

    const exchange = await request(app).post("/api/v1/auth/google/exchange").send({ code });
    expect(exchange.status).toBe(200);
    expect(exchange.body.token).toBeTruthy();
    expect(exchange.body.user.email).toBe(email);
  });

  it("matches the email case-insensitively", async () => {
    stubGoogle();
    const email = `${unique("case")}@neosleepcare.com`;
    await createUser(email);
    googleProfile = { sub: unique("sub"), email: email.toUpperCase(), email_verified: true };

    const location = await callback(app);
    expect(location.pathname).toBe("/auth/callback");
  });

  it("refuses an unknown email with google_no_account and creates no account", async () => {
    stubGoogle();
    const email = `${unique("stranger")}@gmail.com`;
    googleProfile = { sub: unique("sub"), email, email_verified: true };

    const location = await callback(app);
    expect(location.origin).toBe(DEV_ORIGIN);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("google_no_account");
    expect(await readUser(email)).toBeNull();
    const identities = await withTenant(TENANT_SLUG, (client) =>
      client.query(`SELECT 1 FROM identities WHERE email = $1`, [email]),
    );
    expect(identities.rowCount).toBe(0);
  });

  it("refuses an inactive account with google_account_inactive and does not link it", async () => {
    stubGoogle();
    const email = `${unique("inactive")}@neosleepcare.com`;
    const userId = await createUser(email);
    await setStatus(userId, "inactive");
    googleProfile = { sub: unique("sub"), email, email_verified: true };

    const location = await callback(app);
    expect(location.searchParams.get("error")).toBe("google_account_inactive");
    expect((await readUser(email))?.google_sub).toBeNull();
  });

  it("refuses an already-linked account once it is suspended", async () => {
    stubGoogle();
    const email = `${unique("suspended")}@neosleepcare.com`;
    const userId = await createUser(email);
    googleProfile = { sub: unique("sub"), email, email_verified: true };
    expect((await callback(app)).pathname).toBe("/auth/callback");

    await setStatus(userId, "suspended");
    const location = await callback(app);
    expect(location.searchParams.get("error")).toBe("google_account_inactive");
  });

  it("never links by an email Google hasn't verified", async () => {
    stubGoogle();
    const email = `${unique("unverified")}@neosleepcare.com`;
    await createUser(email);
    googleProfile = { sub: unique("sub"), email, email_verified: false };

    const location = await callback(app);
    expect(location.searchParams.get("error")).toBe("google_no_account");
    expect((await readUser(email))?.google_sub).toBeNull();
  });

  it("refuses a second Google account claiming an email already linked to another one", async () => {
    stubGoogle();
    const email = `${unique("taken")}@neosleepcare.com`;
    await createUser(email);
    const firstSub = unique("sub-first");
    googleProfile = { sub: firstSub, email, email_verified: true };
    expect((await callback(app)).pathname).toBe("/auth/callback");

    googleProfile = { sub: unique("sub-second"), email, email_verified: true };
    const location = await callback(app);
    expect(location.searchParams.get("error")).toBe("google_no_account");
    expect((await readUser(email))?.google_sub).toBe(firstSub);
  });

  it("the exchange refuses an account deactivated between callback and exchange", async () => {
    stubGoogle();
    const email = `${unique("race")}@neosleepcare.com`;
    const userId = await createUser(email);
    googleProfile = { sub: unique("sub"), email, email_verified: true };
    const code = (await callback(app)).searchParams.get("code");

    await setStatus(userId, "inactive");
    const exchange = await request(app).post("/api/v1/auth/google/exchange").send({ code });
    expect(exchange.status).toBe(401);
    expect(exchange.body.token).toBeUndefined();
  });
});
