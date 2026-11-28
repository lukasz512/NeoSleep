import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

/** NEO-271: an admin can change a staff user's email; it lands on identities.email and signs the user out. */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function makeUser(role: "admin" | "rep", label: string) {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-neo271-${label}-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant", 4);
    const user = await insertStaffUser(client, email, "Test", label, role, hash, false);
    return { id: user!.id, email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

async function row(userId: string) {
  return withTenant(TENANT_SLUG, async (client) => {
    const r = await client.query<{ email: string; token_version: number; login_email: string | null }>(
      `SELECT i.email, u.token_version, u.login_email FROM users u JOIN identities i ON i.id = u.identity_id WHERE u.id = $1`,
      [userId]
    );
    return r.rows[0]!;
  });
}

describe("PATCH /api/v1/users/:id — email", () => {
  it("saves the new email on the identity, clears login_email and bumps token_version", async () => {
    const admin = await makeUser("admin", "admin");
    const rep = await makeUser("rep", "rep");
    await withTenant(TENANT_SLUG, (c) => c.query(`UPDATE users SET login_email = 'old-alias@example.com' WHERE id = $1`, [rep.id]));
    const before = await row(rep.id);
    const next = `QA-NEO271-new-${uniqueSuffix()}@NeoSleepCare.com`;

    const res = await request(app).patch(`/api/v1/users/${rep.id}`).set("Authorization", admin.auth).send({ email: next });

    expect(res.status).toBe(200);
    const after = await row(rep.id);
    expect(after.email).toBe(next.toLowerCase());
    expect(after.login_email).toBeNull();
    expect(after.token_version).toBe(before.token_version + 1);
  });

  it("rejects an email another user already holds with 409 EMAIL_IN_USE and changes nothing", async () => {
    const admin = await makeUser("admin", "admin2");
    const rep = await makeUser("rep", "rep2");
    const before = await row(rep.id);

    const res = await request(app).patch(`/api/v1/users/${rep.id}`).set("Authorization", admin.auth).send({ email: admin.email });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_IN_USE");
    expect(await row(rep.id)).toEqual(before);
  });

  it("rejects an invalid email with 400", async () => {
    const admin = await makeUser("admin", "admin3");
    const rep = await makeUser("rep", "rep3");
    const res = await request(app).patch(`/api/v1/users/${rep.id}`).set("Authorization", admin.auth).send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("does not sign the user out when the email is unchanged", async () => {
    const admin = await makeUser("admin", "admin4");
    const rep = await makeUser("rep", "rep4");
    const before = await row(rep.id);
    const res = await request(app).patch(`/api/v1/users/${rep.id}`).set("Authorization", admin.auth).send({ email: rep.email });
    expect(res.status).toBe(200);
    expect((await row(rep.id)).token_version).toBe(before.token_version);
  });
});
