import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import {
  withTenant,
  insertStaffUser,
  getGlobalTerritoryId,
  getCountryTerritoryId,
  getEncounterById,
} from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { CreateEncounterCommand, UpdateEncounterCommand } from "../commands/encounter.js";
import { GetEncounterListQuery, GetEncounterByIdQuery } from "./encounter.js";
import { app } from "../server.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * CORE-106 — the Planificador visibility leak.
 *
 * Before this fix:
 *   - GetEncounterListQuery only restricted `rep` to its own encounters;
 *     kam/msl/manager/admin all got EVERY encounter in the tenant back,
 *     unfiltered — a cross-territory, cross-colleague data leak.
 *   - UpdateEncounterCommand (PATCH /encounter/:id) had no ownership/scope
 *     check at all: any authenticated user could edit anyone else's
 *     encounter by id.
 *
 * The fixed rule (queries/encounter.ts's encounterVisibilityScope /
 * isEncounterVisible, the one place this is decided):
 *   rep / kam / msl / doctor   only their own encounters (user_id = self)
 *   manager                    their own encounters PLUS any encounter whose
 *                              territory falls within their allowed scope
 *                              (middleware/requireScope.ts getAllowedScopePaths)
 *   admin                      every encounter in the tenant, whatever its
 *                              territory scope (Łukasz, 2026-10-04)
 *
 * A not-visible encounter 404s (GetEncounterByIdQuery / UpdateEncounterCommand
 * return null) rather than 403ing — existence must not leak.
 *
 * Real Postgres throughout, no mocks, per CLAUDE.md.
 */

type Client = Parameters<typeof CreateEncounterCommand>[0]["client"];

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Client, role: StaffRole, territoryId: string): Promise<TenantContext> {
  const email = `qa-encounter-vis-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Vis", role, hash, false, null, null, territoryId);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, territory_id: territoryId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

const NOW = new Date().toISOString();

describe("Encounter visibility (CORE-106 — Planificador leak)", () => {
  it("rep sees only its own encounter — a coworker's rep encounter is invisible (list and by id)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const repA = await buildTestContext(client, "rep", globalId);
      const repB = await buildTestContext(client, "rep", globalId);

      const encA = await CreateEncounterCommand(repA, { start_at: NOW, type: "visit", notes: "A's visit" });
      const encB = await CreateEncounterCommand(repB, { start_at: NOW, type: "visit", notes: "B's visit" });

      const listA = await GetEncounterListQuery(repA, {});
      expect(listA.items.some((e) => e.id === encA.id)).toBe(true);
      expect(listA.items.some((e) => e.id === encB.id)).toBe(false);

      expect((await GetEncounterByIdQuery(repA, encA.id))?.id).toBe(encA.id);
      expect(await GetEncounterByIdQuery(repA, encB.id)).toBeNull();
    });
  }, 20000);

  it("kam and msl each see only their own encounter, including from each other", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const kamCtx = await buildTestContext(client, "kam", globalId);
      const mslCtx = await buildTestContext(client, "msl", globalId);

      const kamEnc = await CreateEncounterCommand(kamCtx, { start_at: NOW, type: "visit", notes: "kam's visit" });
      const mslEnc = await CreateEncounterCommand(mslCtx, { start_at: NOW, type: "visit", notes: "msl's visit" });

      const kamList = await GetEncounterListQuery(kamCtx, {});
      expect(kamList.items.some((e) => e.id === kamEnc.id)).toBe(true);
      expect(kamList.items.some((e) => e.id === mslEnc.id)).toBe(false);

      const mslList = await GetEncounterListQuery(mslCtx, {});
      expect(mslList.items.some((e) => e.id === mslEnc.id)).toBe(true);
      expect(mslList.items.some((e) => e.id === kamEnc.id)).toBe(false);

      expect(await GetEncounterByIdQuery(kamCtx, mslEnc.id)).toBeNull();
      expect(await GetEncounterByIdQuery(mslCtx, kamEnc.id)).toBeNull();
    });
  }, 20000);

  it("manager sees its own encounters plus any encounter within its territory scope — never another's out-of-scope encounter", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const repPL = await buildTestContext(client, "rep", plId);
      const repMX = await buildTestContext(client, "rep", mxId);
      const managerPL = await buildTestContext(client, "manager", plId);

      const encPL = await CreateEncounterCommand(repPL, { start_at: NOW, type: "visit", territory_id: plId, notes: "PL rep visit" });
      const encMX = await CreateEncounterCommand(repMX, { start_at: NOW, type: "visit", territory_id: mxId, notes: "MX rep visit" });
      // The manager's own encounter, logged under a territory outside their
      // own scope — ownership alone must still make it visible.
      const managerOwnOutOfScope = await CreateEncounterCommand(managerPL, { start_at: NOW, type: "visit", territory_id: mxId, notes: "manager's own, logged under MX" });

      const list = await GetEncounterListQuery(managerPL, {});
      const ids = list.items.map((e) => e.id);
      expect(ids).toContain(encPL.id);                 // in scope, not owned
      expect(ids).toContain(managerOwnOutOfScope.id);   // owned, out of scope
      expect(ids).not.toContain(encMX.id);              // not owned, out of scope

      expect((await GetEncounterByIdQuery(managerPL, encPL.id))?.id).toBe(encPL.id);
      expect((await GetEncounterByIdQuery(managerPL, managerOwnOutOfScope.id))?.id).toBe(managerOwnOutOfScope.id);
      expect(await GetEncounterByIdQuery(managerPL, encMX.id)).toBeNull();
    });
  }, 20000);

  it("admin sees every encounter in the tenant, even with a region-scoped role", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const repPL = await buildTestContext(client, "rep", plId);
      const repMX = await buildTestContext(client, "rep", mxId);
      const adminPL = await buildTestContext(client, "admin", plId);

      const encPL = await CreateEncounterCommand(repPL, { start_at: NOW, type: "visit", territory_id: plId, notes: "PL for admin test" });
      const encMX = await CreateEncounterCommand(repMX, { start_at: NOW, type: "visit", territory_id: mxId, notes: "MX for admin test" });

      const ids = (await GetEncounterListQuery(adminPL, {})).items.map((e) => e.id);
      expect(ids).toContain(encPL.id);
      expect(ids).toContain(encMX.id);

      expect((await GetEncounterByIdQuery(adminPL, encMX.id))?.id).toBe(encMX.id);
      expect((await UpdateEncounterCommand(adminPL, encMX.id, { notes: "edited by admin" }))?.id).toBe(encMX.id);
    });
  }, 20000);

  it("UpdateEncounterCommand: PATCHing a foreign encounter returns null (404) and leaves the row unchanged; PATCHing your own succeeds", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const repA = await buildTestContext(client, "rep", globalId);
      const repB = await buildTestContext(client, "rep", globalId);

      const encA = await CreateEncounterCommand(repA, { start_at: NOW, type: "visit", notes: "original notes" });

      const foreignAttempt = await UpdateEncounterCommand(repB, encA.id, { notes: "hacked by repB" });
      expect(foreignAttempt).toBeNull();

      const unchanged = await getEncounterById(client, encA.id);
      expect(unchanged?.notes).toBe("original notes");

      const ownUpdate = await UpdateEncounterCommand(repA, encA.id, { notes: "updated by owner" });
      expect(ownUpdate?.notes).toBe("updated by owner");
    });
  }, 20000);

  it("UpdateEncounterCommand: a manager may edit an in-scope encounter it doesn't own, but not an out-of-scope one", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const repPL = await buildTestContext(client, "rep", plId);
      const repMX = await buildTestContext(client, "rep", mxId);
      const managerPL = await buildTestContext(client, "manager", plId);

      const encPL = await CreateEncounterCommand(repPL, { start_at: NOW, type: "visit", territory_id: plId, notes: "PL original" });
      const encMX = await CreateEncounterCommand(repMX, { start_at: NOW, type: "visit", territory_id: mxId, notes: "MX original" });

      const editInScope = await UpdateEncounterCommand(managerPL, encPL.id, { notes: "edited by PL manager" });
      expect(editInScope?.notes).toBe("edited by PL manager");

      const editOutOfScope = await UpdateEncounterCommand(managerPL, encMX.id, { notes: "should not apply" });
      expect(editOutOfScope).toBeNull();

      const stillOriginal = await getEncounterById(client, encMX.id);
      expect(stillOriginal?.notes).toBe("MX original");
    });
  }, 20000);
});

describe("PATCH /api/v1/encounter/:id — HTTP-level 404 on a foreign encounter (CORE-106)", () => {
  async function repAuth(label: string): Promise<{ header: string; userId: string }> {
    const email = `qa-encounter-vis-http-${label}-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await withTenant(TENANT_SLUG, (client) => insertStaffUser(client, email, "QA", "Http", "rep", hash, false));
    return { header: `Bearer ${signAuthToken({ id: user!.id, email, role: "rep", token_version: 0 })}`, userId: user!.id };
  }

  it("another rep's encounter 404s on PATCH; the owner's own PATCH 200s", async () => {
    const authA = await repAuth("a");
    const authB = await repAuth("b");

    const created = await request(app)
      .post("/api/v1/encounter")
      .set("Authorization", authA.header)
      .send({ start_at: NOW, type: "visit", notes: "owned by A" });
    expect(created.status).toBe(201);

    const foreignPatch = await request(app)
      .patch(`/api/v1/encounter/${created.body.id}`)
      .set("Authorization", authB.header)
      .send({ notes: "B tries to edit A's encounter" });
    expect(foreignPatch.status).toBe(404);

    const ownPatch = await request(app)
      .patch(`/api/v1/encounter/${created.body.id}`)
      .set("Authorization", authA.header)
      .send({ notes: "A edits their own" });
    expect(ownPatch.status).toBe(200);
    expect(ownPatch.body.notes).toBe("A edits their own");
  });
});
