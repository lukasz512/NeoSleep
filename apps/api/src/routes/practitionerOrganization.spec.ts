import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPractitioner, insertOrganization } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Route/auth-boundary tests for the 3 new clinic-affiliation sub-routes
 * added for NEO-17 (see docs/stories/pwa-medico-view.md). Deep behavioral
 * coverage (dual-scoped primary, territory scoping, conflict handling) lives
 * in commands/practitionerOrganization.spec.ts — this file only exercises
 * the HTTP layer: auth, RBAC (kam/msl excluded, unlike the rest of this
 * router), and a couple of round trips through the real Express app.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function insertTestUser(
  client: Parameters<typeof insertStaffUser>[0],
  role: StaffRole
): Promise<{ id: string; email: string }> {
  const email = `qa-prac-org-route-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Route", role, hash, false);
  return { id: user!.id, email };
}

function tokenFor(user: { id: string; email: string }, role: StaffRole): string {
  return signAuthToken({ id: user.id, email: user.email, role, token_version: 0 });
}

async function setupPractitionerAndOrg() {
  return withTenant(TENANT_SLUG, async (client) => {
    const practitioner = await insertPractitioner(client, {
      first_name: "Route",
      last_name: `Clinics-${uniqueSuffix()}`,
    });
    const org = await insertOrganization(client, { name: `QA Route Clinic ${uniqueSuffix()}` });
    return { practitionerId: practitioner.id, orgId: org.id };
  });
}

describe("POST /api/v1/practitioner/:id/organizations", () => {
  it("401s with no token", async () => {
    const res = await request(app).post(`/api/v1/practitioner/${crypto.randomUUID()}/organizations`).send({ organization_id: crypto.randomUUID() });
    expect(res.status).toBe(401);
  });

  it.each<StaffRole>(["kam", "msl"])("403s for %s (excluded — only admin/manager/rep manage affiliations)", async (role) => {
    const user = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, role));
    const { practitionerId, orgId } = await setupPractitionerAndOrg();

    const res = await request(app)
      .post(`/api/v1/practitioner/${practitionerId}/organizations`)
      .set("Authorization", `Bearer ${tokenFor(user, role)}`)
      .send({ organization_id: orgId });
    expect(res.status).toBe(403);
  });

  it("201s for a rep and links the clinic", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const { practitionerId, orgId } = await setupPractitionerAndOrg();

    const res = await request(app)
      .post(`/api/v1/practitioner/${practitionerId}/organizations`)
      .set("Authorization", `Bearer ${tokenFor(rep, "rep")}`)
      .send({ organization_id: orgId });
    expect(res.status).toBe(201);
    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.organizations[0].organization_id).toBe(orgId);
  });
});

describe("DELETE /api/v1/practitioner/:id/organizations/:orgId", () => {
  it("401s with no token", async () => {
    const res = await request(app).delete(`/api/v1/practitioner/${crypto.randomUUID()}/organizations/${crypto.randomUUID()}`);
    expect(res.status).toBe(401);
  });

  it("removes the affiliation for an admin", async () => {
    const admin = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "admin"));
    const { practitionerId, orgId } = await setupPractitionerAndOrg();
    const auth = `Bearer ${tokenFor(admin, "admin")}`;
    await request(app).post(`/api/v1/practitioner/${practitionerId}/organizations`).set("Authorization", auth).send({ organization_id: orgId });

    const res = await request(app).delete(`/api/v1/practitioner/${practitionerId}/organizations/${orgId}`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.organizations).toHaveLength(0);
  });
});

describe("PATCH /api/v1/practitioner/:id/organizations/:orgId/primary", () => {
  it("401s with no token", async () => {
    const res = await request(app).patch(`/api/v1/practitioner/${crypto.randomUUID()}/organizations/${crypto.randomUUID()}/primary`);
    expect(res.status).toBe(401);
  });

  it("full round trip: manager links then sets a clinic as the global primary", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const { practitionerId, orgId } = await setupPractitionerAndOrg();
    const auth = `Bearer ${tokenFor(manager, "manager")}`;
    await request(app).post(`/api/v1/practitioner/${practitionerId}/organizations`).set("Authorization", auth).send({ organization_id: orgId });

    const res = await request(app).patch(`/api/v1/practitioner/${practitionerId}/organizations/${orgId}/primary`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.organizations[0].is_primary).toBe(true);
    expect(res.body.my_primary_organization_id).toBeNull(); // manager has no personal assignment row
  });

  it("a rep setting primary populates my_primary_organization_id without touching the global flag", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const { practitionerId, orgId } = await setupPractitionerAndOrg();
    const auth = `Bearer ${tokenFor(rep, "rep")}`;
    await request(app).post(`/api/v1/practitioner/${practitionerId}/organizations`).set("Authorization", auth).send({ organization_id: orgId });

    const res = await request(app).patch(`/api/v1/practitioner/${practitionerId}/organizations/${orgId}/primary`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.organizations[0].is_primary).toBe(false);
    expect(res.body.my_primary_organization_id).toBe(orgId);
  });
});

describe("GET /api/v1/practitioner/:id includes the affiliation list", () => {
  it("returns organizations[] and my_primary_organization_id alongside the rest of the practitioner", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const { practitionerId, orgId } = await setupPractitionerAndOrg();
    const auth = `Bearer ${tokenFor(rep, "rep")}`;
    await request(app).post(`/api/v1/practitioner/${practitionerId}/organizations`).set("Authorization", auth).send({ organization_id: orgId });
    await request(app).patch(`/api/v1/practitioner/${practitionerId}/organizations/${orgId}/primary`).set("Authorization", auth);

    const res = await request(app).get(`/api/v1/practitioner/${practitionerId}`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.my_primary_organization_id).toBe(orgId);
  });
});
