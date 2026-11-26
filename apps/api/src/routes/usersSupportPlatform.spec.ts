import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * CORE-209: setting role Support on the Users screen also opens the cross-tenant
 * screens (Errors, work board) — no hand-written platform.users row. Only a platform
 * admin can grant that; a tenant-only admin sets the tenant role and nothing more.
 * Real Express stack, real Postgres.
 */
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const mail = (label: string) => `qa-sps-${label}-${SUFFIX}@neosleepcare.com`;
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

interface Account { id: string; email: string; auth: string }

async function account(role: StaffRole, label: string): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = mail(label);
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", `SPS ${label}`, role, hash, false);
    return { id: user!.id, email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

async function platformRow(email: string): Promise<{ role: string; is_active: boolean } | null> {
  const { rows } = await getDb().query<{ role: string; is_active: boolean }>(
    "SELECT role, is_active FROM platform.users WHERE lower(email) = lower($1)",
    [email]
  );
  return rows[0] ?? null;
}

async function boardAccess(target: Account): Promise<boolean> {
  const res = await request(app).get("/api/v1/admin/issues/access").set("Authorization", target.auth);
  return res.body.platformAdmin === true;
}

function newUser(label: string) {
  return { first_name: "QA", last_name: `SPS ${label}`, email: mail(label), role: "support" };
}

describe("Users screen grants platform access with role Support (CORE-209)", () => {
  let platformAdmin: Account;
  let tenantAdmin: Account;

  beforeAll(async () => {
    platformAdmin = await account("admin", "padmin");
    tenantAdmin = await account("admin", "tadmin");
    await getDb().query("INSERT INTO platform.users (email, name, role) VALUES ($1, 'QA Platform Admin', 'admin')", [platformAdmin.email]);
  });

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.users WHERE lower(email) LIKE $1", [`qa-sps-%-${SUFFIX}@%`]);
  });

  it("a platform admin creating a Support user opens the board and Errors for them", async () => {
    const res = await request(app).post("/api/v1/users").set("Authorization", platformAdmin.auth).send(newUser("created"));
    expect(res.status).toBe(201);
    expect(await platformRow(mail("created"))).toEqual({ role: "support", is_active: true });
    const created: Account = {
      id: res.body.id,
      email: mail("created"),
      auth: `Bearer ${signAuthToken({ id: res.body.id, email: mail("created"), role: "support", token_version: 0 })}`,
    };
    expect(await boardAccess(created)).toBe(true);
  });

  it("a platform admin changing a rep to Support grants it; changing back revokes it", async () => {
    const rep = await account("rep", "switched");
    const toSupport = await request(app).patch(`/api/v1/users/${rep.id}`).set("Authorization", platformAdmin.auth).send({ role: "support" });
    expect(toSupport.status).toBe(200);
    expect(await platformRow(rep.email)).toEqual({ role: "support", is_active: true });

    const back = await request(app).patch(`/api/v1/users/${rep.id}`).set("Authorization", platformAdmin.auth).send({ role: "rep" });
    expect(back.status).toBe(200);
    expect(await platformRow(rep.email)).toEqual({ role: "support", is_active: false });
  });

  it("deactivating or deleting a Support user revokes it", async () => {
    const deactivated = await account("rep", "deact");
    await request(app).patch(`/api/v1/users/${deactivated.id}`).set("Authorization", platformAdmin.auth).send({ role: "support" });
    await request(app).patch(`/api/v1/users/${deactivated.id}`).set("Authorization", platformAdmin.auth).send({ status: "inactive" });
    expect((await platformRow(deactivated.email))?.is_active).toBe(false);

    const deleted = await account("rep", "deleted");
    await request(app).patch(`/api/v1/users/${deleted.id}`).set("Authorization", platformAdmin.auth).send({ role: "support" });
    const del = await request(app).delete(`/api/v1/users/${deleted.id}`).set("Authorization", platformAdmin.auth);
    expect(del.status).toBeLessThan(300);
    expect((await platformRow(deleted.email))?.is_active).toBe(false);
  });

  it("a tenant-only admin sets the tenant role but grants no cross-tenant access", async () => {
    const res = await request(app).post("/api/v1/users").set("Authorization", tenantAdmin.auth).send(newUser("tenantonly"));
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("support");
    expect(await platformRow(mail("tenantonly"))).toBeNull();
  });

  it("never downgrades a platform owner/admin row", async () => {
    const colleague = await account("rep", "colleague");
    await getDb().query("INSERT INTO platform.users (email, name, role) VALUES ($1, 'QA Colleague', 'admin')", [colleague.email]);
    await request(app).patch(`/api/v1/users/${colleague.id}`).set("Authorization", platformAdmin.auth).send({ role: "support" });
    expect(await platformRow(colleague.email)).toEqual({ role: "admin", is_active: true });
    await request(app).patch(`/api/v1/users/${colleague.id}`).set("Authorization", platformAdmin.auth).send({ role: "rep" });
    expect(await platformRow(colleague.email)).toEqual({ role: "admin", is_active: true });
  });
});
