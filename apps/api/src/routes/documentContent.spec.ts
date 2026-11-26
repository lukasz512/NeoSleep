import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Route-level auth boundary + full round-trip test — real Postgres, same
 * pattern as routes/territory.spec.ts. Uses the "__test" manifest entry
 * (see commands/documentContent.spec.ts's own comment) so this suite never
 * touches a real document's is_current row in the shared, non-tenant-
 * isolated platform.document_content_version table.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function insertTestUser(
  client: Parameters<typeof insertStaffUser>[0],
  role: StaffRole
): Promise<{ id: string; email: string }> {
  const email = `qa-doc-content-route-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
  return { id: user!.id, email };
}

function tokenFor(user: { id: string; email: string }, role: StaffRole): string {
  return signAuthToken({ id: user.id, email: user.email, role, token_version: 0 });
}

function tokenForNonexistentUser(role: StaffRole): string {
  return signAuthToken({
    id: crypto.randomUUID(),
    email: `qa-doc-content-route-${uniqueSuffix()}@neosleepcare.com`,
    role,
    token_version: 0,
  });
}

describe("GET /api/v1/document-content", () => {
  it("401s with no token", async () => {
    const res = await request(app).get("/api/v1/document-content");
    expect(res.status).toBe(401);
  });

  it("403s for a rep", async () => {
    const res = await request(app)
      .get("/api/v1/document-content")
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`);
    expect(res.status).toBe(403);
  });

  it("403s for a doctor", async () => {
    const res = await request(app)
      .get("/api/v1/document-content")
      .set("Authorization", `Bearer ${tokenForNonexistentUser("doctor")}`);
    expect(res.status).toBe(403);
  });

  it("200s for manager and never includes the hidden __test fixture", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const res = await request(app)
      .get("/api/v1/document-content")
      .set("Authorization", `Bearer ${tokenFor(manager, "manager")}`);
    expect(res.status).toBe(200);
    expect(res.body.map((e: { templateKey: string }) => e.templateKey)).not.toContain("__test");
  });
});

describe("POST /api/v1/document-content/:templateKey/:locale and the get/list endpoints (admin+manager only)", () => {
  it("403s a save from a rep", async () => {
    const res = await request(app)
      .post("/api/v1/document-content/__test/en")
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`)
      .send({ contentHtml: "<p>x</p>" });
    expect(res.status).toBe(403);
  });

  it("full round trip: save (manager) -> get current -> list versions -> get by id, and a second save never alters the first version's stored content", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const auth = `Bearer ${tokenFor(manager, "manager")}`;

    // "__test"/"en" is a shared key across test RUNS (platform schema isn't
    // torn down between runs, unlike the rest of this test DB — see this
    // file's own top comment), so version_number keeps climbing run over
    // run. Never assert it's exactly 1 here; only the increment
    // relationship between save1 and save2 below is guaranteed.
    const save1 = await request(app)
      .post("/api/v1/document-content/__test/en")
      .set("Authorization", auth)
      .send({ contentHtml: "<p>round-trip v1</p>" });
    expect(save1.status).toBe(200);
    expect(save1.body.content_html).toContain("round-trip v1");
    const v1Id = save1.body.id;

    const save2 = await request(app)
      .post("/api/v1/document-content/__test/en")
      .set("Authorization", auth)
      .send({ contentHtml: "<p>round-trip v2</p>" });
    expect(save2.status).toBe(200);
    expect(save2.body.version_number).toBe(save1.body.version_number + 1);

    // The concrete proof, at the HTTP boundary, that editing never
    // retroactively changes an already-generated PDF's content: v1's own
    // stored content_html is exactly what it was at save time, still.
    const v1Refetched = await request(app)
      .get(`/api/v1/document-content/__test/en/versions/${v1Id}`)
      .set("Authorization", auth);
    expect(v1Refetched.status).toBe(200);
    expect(v1Refetched.body.content_html).toContain("round-trip v1");
    expect(v1Refetched.body.is_current).toBe(false);

    const current = await request(app).get("/api/v1/document-content/__test/en").set("Authorization", auth);
    expect(current.status).toBe(200);
    expect(current.body.id).toBe(save2.body.id);
    expect(current.body.content_html).toContain("round-trip v2");

    const history = await request(app)
      .get("/api/v1/document-content/__test/en/versions")
      .set("Authorization", auth);
    expect(history.status).toBe(200);
    expect(history.body.map((v: { id: string }) => v.id)).toEqual(
      expect.arrayContaining([save1.body.id, save2.body.id])
    );
  });

  it("400s a save with no contentHtml", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const res = await request(app)
      .post("/api/v1/document-content/__test/en")
      .set("Authorization", `Bearer ${tokenFor(manager, "manager")}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400s, not a raw DB/500 error, for an unknown templateKey/locale combination", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const res = await request(app)
      .post(`/api/v1/document-content/unknown-${uniqueSuffix()}/en`)
      .set("Authorization", `Bearer ${tokenFor(manager, "manager")}`)
      .send({ contentHtml: "<p>x</p>" });
    expect(res.status).toBe(400);
  });

  it("404s getting current content for a template_key/locale with no saved version", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    // The GET-current route/query performs no manifest validation (only the
    // POST/save path does — see commands/documentContent.ts) — a guaranteed-
    // fresh synthetic templateKey is fine here and, unlike reusing "__test",
    // is guaranteed to have zero rows regardless of what any earlier test
    // run left behind in the shared, non-tenant-isolated platform schema.
    const res = await request(app)
      .get(`/api/v1/document-content/qa-route-nonexistent-${uniqueSuffix()}/en`)
      .set("Authorization", `Bearer ${tokenFor(manager, "manager")}`);
    // Proves the "fail loudly on missing content" behavior from
    // GetCurrentDocumentContentQuery survives to the route.
    expect(res.status).toBe(404);
  });
});

describe("GET/PUT /api/v1/document-content/:templateKey/entity-types (admin+manager only)", () => {
  it("401s with no token", async () => {
    const res = await request(app).get("/api/v1/document-content/__test/entity-types");
    expect(res.status).toBe(401);
  });

  it("403s a get from a rep", async () => {
    const res = await request(app)
      .get("/api/v1/document-content/__test/entity-types")
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`);
    expect(res.status).toBe(403);
  });

  it("403s a put from a rep", async () => {
    const res = await request(app)
      .put("/api/v1/document-content/__test/entity-types")
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`)
      .send({ entityTypes: ["patient"] });
    expect(res.status).toBe(403);
  });

  it("400s a put with a non-array entityTypes", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const res = await request(app)
      .put("/api/v1/document-content/__test/entity-types")
      .set("Authorization", `Bearer ${tokenFor(manager, "manager")}`)
      .send({ entityTypes: "patient" });
    expect(res.status).toBe(400);
  });

  it("400s a put for an unknown templateKey", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const res = await request(app)
      .put(`/api/v1/document-content/unknown-${uniqueSuffix()}/entity-types`)
      .set("Authorization", `Bearer ${tokenFor(manager, "manager")}`)
      .send({ entityTypes: ["patient"] });
    expect(res.status).toBe(400);
  });

  it("full round trip: put (manager) -> get returns the saved assignment", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const auth = `Bearer ${tokenFor(manager, "manager")}`;

    const put = await request(app)
      .put("/api/v1/document-content/__test/entity-types")
      .set("Authorization", auth)
      .send({ entityTypes: ["practitioner", "organization"] });
    expect(put.status).toBe(200);
    expect((put.body as string[]).sort()).toEqual(["organization", "practitioner"]);

    const get = await request(app).get("/api/v1/document-content/__test/entity-types").set("Authorization", auth);
    expect(get.status).toBe(200);
    expect((get.body as string[]).sort()).toEqual(["organization", "practitioner"]);
  });
});

describe("GET/PUT /api/v1/document-content/:templateKey/patient-checklist (admin+manager only)", () => {
  it("403s a rep", async () => {
    const res = await request(app)
      .put("/api/v1/document-content/__test/patient-checklist")
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`)
      .send({ fillMode: "patient", sortOrder: 10 });
    expect(res.status).toBe(403);
  });

  it("round trip, and re-saving the entity types keeps the checklist config (delete-then-insert must not drop it)", async () => {
    const manager = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "manager"));
    const auth = `Bearer ${tokenFor(manager, "manager")}`;

    await request(app).put("/api/v1/document-content/__test/entity-types").set("Authorization", auth).send({ entityTypes: ["organization"] });
    const notAssigned = await request(app)
      .put("/api/v1/document-content/__test/patient-checklist")
      .set("Authorization", auth)
      .send({ fillMode: "patient", sortOrder: 25 });
    expect(notAssigned.status).toBe(400);

    await request(app).put("/api/v1/document-content/__test/entity-types").set("Authorization", auth).send({ entityTypes: ["patient"] });
    const bad = await request(app)
      .put("/api/v1/document-content/__test/patient-checklist")
      .set("Authorization", auth)
      .send({ fillMode: "whoever", sortOrder: 25 });
    expect(bad.status).toBe(400);

    const put = await request(app)
      .put("/api/v1/document-content/__test/patient-checklist")
      .set("Authorization", auth)
      .send({ fillMode: "patient", sortOrder: 25 });
    expect(put.status).toBe(200);

    await request(app).put("/api/v1/document-content/__test/entity-types").set("Authorization", auth).send({ entityTypes: ["patient", "lead"] });
    const get = await request(app).get("/api/v1/document-content/__test/patient-checklist").set("Authorization", auth);
    expect(get.body).toEqual({ fillMode: "patient", sortOrder: 25 });

    // Leave the shared platform fixture unassigned for other specs.
    await request(app).put("/api/v1/document-content/__test/entity-types").set("Authorization", auth).send({ entityTypes: [] });
  });
});
