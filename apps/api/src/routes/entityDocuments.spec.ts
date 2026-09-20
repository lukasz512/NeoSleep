import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Auth-boundary tests for the new HCP/HCO/Patient "Documents" tab sub-routes
 * (Slice 1 of docs/stories/documents-system-entity-integration.md). Unlike
 * routes/documentContent.ts (admin/manager only, the editor surface), these
 * are requireAuth — any authenticated staff role sees an entity's documents,
 * matching that detail page's own visibility (Łukasz's decision, see the
 * story's resolved open questions). Real Postgres, same pattern as
 * routes/documentContent.spec.ts.
 */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function insertTestUser(
  client: Parameters<typeof insertStaffUser>[0],
  role: StaffRole
): Promise<{ id: string; email: string }> {
  const email = `qa-entity-docs-route-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
  return { id: user!.id, email };
}

function tokenFor(user: { id: string; email: string }, role: StaffRole): string {
  return signAuthToken({ id: user.id, email: user.email, role, token_version: 0 });
}

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

describe.each([
  ["practitioner", "/api/v1/practitioner"],
  ["organization", "/api/v1/organization"],
  ["patient", "/api/v1/patient"],
])("GET %s/:id/documents", (_label, basePath) => {
  it("401s with no token", async () => {
    const res = await request(app).get(`${basePath}/${crypto.randomUUID()}/documents`);
    expect(res.status).toBe(401);
  });

  it("200s (empty list) for any authenticated staff role, e.g. rep", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const res = await request(app)
      .get(`${basePath}/${crypto.randomUUID()}/documents`)
      .set("Authorization", `Bearer ${tokenFor(rep, "rep")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("404s a download for a nonexistent document id", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const res = await request(app)
      .get(`${basePath}/${crypto.randomUUID()}/documents/00000000-0000-0000-0000-000000000000/download`)
      .set("Authorization", `Bearer ${tokenFor(rep, "rep")}`);
    expect(res.status).toBe(404);
  });
});
