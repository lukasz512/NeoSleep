import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";
import { isSupportAllowed } from "./supportAllowlist.js";

/**
 * NeoCRM support role (CORE-197) through the real Express stack and real Postgres:
 * the five screens it is for open, everything else answers 403, and the cross-tenant
 * screens (Errors, work board) also need a platform.users row.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Account { email: string; auth: string }

async function account(role: StaffRole, label: string): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-sup-${label}-${SUFFIX}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", `Support ${label}`, role, hash, false);
    return { email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

describe("support role", () => {
  let platformSupport: Account;
  let tenantOnlySupport: Account;

  beforeAll(async () => {
    platformSupport = await account("support", "platform");
    tenantOnlySupport = await account("support", "tenant");
    await getDb().query(`INSERT INTO platform.users (email, name, role, is_active) VALUES ($1, 'QA Support', 'support', true)`, [
      platformSupport.email,
    ]);
  });

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.users WHERE lower(email) LIKE $1", [`qa-sup-%-${SUFFIX}@%`]);
  });

  it("opens Calendar, Documents, Reports, Errors and the work board", async () => {
    const start = new Date().toISOString().slice(0, 10);
    for (const path of [
      `/api/v1/calendar?start=${start}&end=${start}`,
      "/api/v1/document-content",
      "/api/v1/admin/problem-reports",
      "/api/v1/admin/diagnostics",
      "/api/v1/platform/work/teams",
      "/api/v1/problem-reports/mine",
    ]) {
      const res = await request(app).get(path).set("Authorization", platformSupport.auth);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it("tells the Reports screen to show the Errors tab", async () => {
    const res = await request(app).get("/api/v1/admin/issues/access").set("Authorization", platformSupport.auth);
    expect(res.status).toBe(200);
    expect(res.body.platformAdmin).toBe(true);
  });

  it("answers 403 on patients, HCPs, leads, users, territories, appointments and device orders", async () => {
    for (const path of [
      "/api/v1/patient",
      "/api/v1/practitioner",
      "/api/v1/organization",
      "/api/v1/leads",
      "/api/v1/users",
      "/api/v1/territory",
      "/api/v1/appointments",
      "/api/v1/encounter",
      "/api/v1/device-orders",
      "/api/v1/sleep-study",
      "/api/v1/treatment-plan",
    ]) {
      const res = await request(app).get(path).set("Authorization", platformSupport.auth);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  });

  it("says the refusal is about the role, not a region (CORE-224)", async () => {
    const res = await request(app).patch("/api/v1/appointments/00000000-0000-0000-0000-000000000000").set("Authorization", platformSupport.auth).send({});
    expect([res.status, res.body.code, res.body.reason]).toEqual([403, "FORBIDDEN", "ROLE_NOT_ALLOWED"]);
  });

  it("can't write to the app config or create users", async () => {
    expect((await request(app).patch("/api/v1/config/app").set("Authorization", platformSupport.auth).send({})).status).toBe(403);
    expect((await request(app).post("/api/v1/users").set("Authorization", platformSupport.auth).send({})).status).toBe(403);
  });

  it("keeps Errors and the work board closed without a platform.users row", async () => {
    expect((await request(app).get("/api/v1/admin/diagnostics").set("Authorization", tenantOnlySupport.auth)).status).toBe(403);
    expect((await request(app).get("/api/v1/platform/work/teams").set("Authorization", tenantOnlySupport.auth)).status).toBe(403);
    const access = await request(app).get("/api/v1/admin/issues/access").set("Authorization", tenantOnlySupport.auth);
    expect(access.body.platformAdmin).toBe(false);
  });

  it("lists support staff as work board assignees", async () => {
    const res = await request(app).get("/api/v1/platform/work/people").set("Authorization", platformSupport.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { email: string }) => p.email)).toContain(platformSupport.email);
  });

  it("matches methods, not just paths", () => {
    expect(isSupportAllowed("GET", "/calendar")).toBe(true);
    expect(isSupportAllowed("POST", "/calendar")).toBe(false);
    expect(isSupportAllowed("PATCH", "/config/app")).toBe(false);
    expect(isSupportAllowed("GET", "/admin/notification-defaults")).toBe(false);
    expect(isSupportAllowed("GET", "/calendarx")).toBe(false);
  });
});
