import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser, insertPatient, insertPractitioner, insertOrganization } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * CORE-292 global search through the real Express stack and real Postgres.
 * Scope is whatever the list endpoints already enforce (the handler reuses their queries),
 * so each role is proven as "search is a subset of the list for the same term".
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "x");
const EMAIL_TAG = `${Date.now()}-${SUFFIX}`;

interface Account { id: string; auth: string }

async function account(role: StaffRole): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-search-${role}-${EMAIL_TAG}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    // A doctor login is only valid when a practitioner shares its email (CORE-173).
    if (role === "doctor") await insertPractitioner(client, { first_name: "QA", last_name: `Doctor${SUFFIX}`, email });
    const user = await insertStaffUser(client, email, "QA", `Search ${role}`, role, hash, false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

interface Hit { id: string; label: string; sublabel: string | null; region: string | null }
interface SearchBody { patients: Hit[]; practitioners: Hit[]; organizations: Hit[] }

const search = (who: Account, term: unknown) =>
  request(app).post("/api/v1/search").set("Authorization", who.auth).send({ term });

describe("POST /api/v1/search", () => {
  const roles: StaffRole[] = ["admin", "manager", "kam", "msl", "rep", "doctor"];
  const allRoles: StaffRole[] = [...roles, "support"];
  const accounts = {} as Record<StaffRole, Account>;
  let patientId: string;
  let practitionerId: string;
  let orgId: string;
  const xtSchema = `xt_search_${SUFFIX}`;

  beforeAll(async () => {
    for (const r of allRoles) accounts[r] = await account(r);
    await withTenant(TENANT_SLUG, async (client) => {
      const p = await insertPatient(client, { first_name: "José", last_name: `Quirós${SUFFIX}` });
      patientId = p.id;
      const d = await insertPractitioner(client, { first_name: "Żółć", last_name: `Lekarz${SUFFIX}`, email: `qa-search-prac-${EMAIL_TAG}@neosleepcare.com` });
      practitionerId = d.id;
      const o = await insertOrganization(client, { name: `Clínica Ñandú ${SUFFIX}` });
      orgId = o.id;
    });
    // A second tenant schema holding a row that must never be returned.
    await getDb().query(`SELECT create_tenant_schema($1)`, [xtSchema]);
    await withTenant(xtSchema, async (client) => {
      await insertPatient(client, { first_name: "Other", last_name: `Tenant${SUFFIX}` });
    });
  });

  afterAll(async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      await client.query("DELETE FROM audit_log WHERE user_id = ANY($1::uuid[])", [Object.values(accounts).map((a) => a.id)]);
    });
    await getDb().query(`DROP SCHEMA IF EXISTS ${xtSchema} CASCADE`).catch(() => undefined);
    await getDb().query("DELETE FROM identities WHERE email LIKE $1", [`qa-search-%-${EMAIL_TAG}@%`]).catch(() => undefined);
  });

  it("rejects a request without a token (401)", async () => {
    await request(app).post("/api/v1/search").send({ term: "ab" }).expect(401);
  });

  it("is no-store and keeps the term out of the URL", async () => {
    const res = await search(accounts.admin, `quiros${SUFFIX}`).expect(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    await request(app).get("/api/v1/search").set("Authorization", accounts.admin.auth).expect(404);
  });

  it("finds all three groups for an admin, with only id, label, sublabel and region", async () => {
    const res = await search(accounts.admin, `quiros${SUFFIX}`).expect(200);
    const body = res.body as SearchBody;
    expect(body.patients.map((h) => h.id)).toContain(patientId);
    for (const hit of body.patients) expect(Object.keys(hit).sort()).toEqual(["id", "label", "region", "sublabel"]);
    const doc = (await search(accounts.admin, `lekarz${SUFFIX}`)).body as SearchBody;
    expect(doc.practitioners.map((h) => h.id)).toContain(practitionerId);
    const org = (await search(accounts.admin, `nandu ${SUFFIX}`)).body as SearchBody;
    expect(org.organizations.map((h) => h.id)).toContain(orgId);
  });

  it("is accent-insensitive and treats NFC and NFD alike", async () => {
    const nfc = (await search(accounts.admin, `QUIRÓS${SUFFIX}`)).body as SearchBody;
    const nfd = (await search(accounts.admin, `QUIRÓS${SUFFIX}`.normalize("NFD"))).body as SearchBody;
    const plain = (await search(accounts.admin, `quiros${SUFFIX}`)).body as SearchBody;
    for (const b of [nfc, nfd, plain]) expect(b.patients.map((h) => h.id)).toContain(patientId);
    const jose = (await search(accounts.admin, "jose")).body as SearchBody;
    expect(Array.isArray(jose.patients)).toBe(true);
    // "zolc" finds a doctor named "Żółć"
    const zolc = (await search(accounts.admin, "zolc")).body as SearchBody;
    expect(zolc.practitioners.map((h) => h.id)).toContain(practitionerId);
  });

  it("treats %, _ and \\ literally and survives an injection string", async () => {
    for (const term of ["%%", "__", "\\\\", "a%", "'; DROP TABLE identities;--"]) {
      const res = await search(accounts.admin, term).expect(200);
      const body = res.body as SearchBody;
      expect({ term, hits: body.patients.length + body.practitioners.length + body.organizations.length }).toEqual({ term, hits: 0 });
    }
  });

  it("rejects a term shorter than 2 or longer than 100 chars, or not a string (400)", async () => {
    for (const term of ["", " a ", "a", "x".repeat(101), 42, null, undefined]) {
      await search(accounts.admin, term).expect(400);
    }
    await search(accounts.admin, "x".repeat(100)).expect(200);
  });

  it("never returns another tenant's rows", async () => {
    const res = await search(accounts.admin, `tenant${SUFFIX}`).expect(200);
    const body = res.body as SearchBody;
    expect(body.patients).toEqual([]);
  });

  it.each(roles)("%s: search is a subset of the list endpoints for the same term", async (role) => {
    const who = accounts[role];
    const term = "qui";
    const res = await search(who, term).expect(200);
    const body = res.body as SearchBody;
    const lists: Array<[keyof SearchBody, string]> = [
      ["patients", "patient"],
      ["practitioners", "practitioner"],
      ["organizations", "organization"],
    ];
    for (const [group, path] of lists) {
      const list = await request(app).get(`/api/v1/${path}?search=${term}&limit=500`).set("Authorization", who.auth);
      const listIds = new Set(((list.body.items ?? []) as Array<{ id: string }>).map((i) => i.id));
      for (const hit of body[group]) expect({ role, group, id: hit.id, inList: listIds.has(hit.id) }).toMatchObject({ inList: true });
      expect(body[group].length).toBeLessThanOrEqual(5);
    }
  });

  it("a doctor never finds a patient who is not theirs", async () => {
    const body = (await search(accounts.doctor, `quiros${SUFFIX}`)).body as SearchBody;
    expect(body.patients.map((h) => h.id)).not.toContain(patientId);
  });

  it("audits the term length and per-group counts, never the term or a name", async () => {
    const term = `quiros${SUFFIX}`;
    await search(accounts.manager, term).expect(200);
    const rows = await withTenant(TENANT_SLUG, async (client) => {
      const { rows } = await client.query(
        "SELECT metadata, user_agent, outcome FROM audit_log WHERE user_id = $1 AND entity_type = 'Search' ORDER BY created_at DESC",
        [accounts.manager.id]
      );
      return rows as Array<{ metadata: Record<string, unknown> }>;
    });
    expect(rows.length).toBeGreaterThan(0);
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(SUFFIX);
    expect(serialised.toLowerCase()).not.toContain("quir");
    expect(rows[0]!.metadata).toMatchObject({ term_chars: term.length });
    expect(rows[0]!.metadata).toHaveProperty("counts");
  });

  it("support (NeoCRM staff) has no access to CRM data: 403", async () => {
    await search(accounts.support, "qui").expect(403);
  });

  it("answers the 31st request inside the window with 429", async () => {
    const who = accounts.rep;
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await search(who, "ab")).status;
    expect(last).toBe(429);
  });
});
