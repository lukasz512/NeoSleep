import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePatientCommand } from "../commands/patient.js";
import { GetPatientListQuery } from "./patient.js";

/**
 * NEO-223: each patient list row carries its latest device order, so the
 * list's Next step can follow the order instead of the QR. Real Postgres.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = Parameters<typeof CreatePatientCommand>[0]["client"];

async function adminContext(client: Client): Promise<TenantContext> {
  const globalId = await getGlobalTerritoryId(client);
  const email = `qa-device-order-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "DeviceOrder", "admin", hash, false, null, null, globalId);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: globalId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("GetPatientListQuery device_order (NEO-223)", () => {
  it("is null without a plan, the latest live plan otherwise (draft flagged, deleted ignored)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await adminContext(client);
      const lastName = `DeviceOrder-${uniqueSuffix()}`;
      const create = (first: string) =>
        CreatePatientCommand(ctx, {
          gender: "female", date_of_birth: "1980-01-01",
          first_name: first, last_name: lastName,
          email: `${first.toLowerCase()}-${uniqueSuffix()}@example.com`, phone: "600100300",
        });
      const none = await create("None");
      const ordered = await create("Ordered");
      const draft = await create("Draft");

      const plan = (patientId: string, status: string, metadata: Record<string, unknown> | null, createdAt: string, deleted = false) =>
        client.query(
          `INSERT INTO treatment_plan (patient_id, type, status, metadata, created_at, deleted_at)
           VALUES ($1, 'dental_appliance', $2, $3, $4, ${deleted ? "now()" : "NULL"})`,
          [patientId, status, metadata === null ? null : JSON.stringify(metadata), createdAt],
        );
      await plan(ordered.id, "cancelled", null, "2026-01-01T00:00:00Z");
      await plan(ordered.id, "in_progress", null, "2026-02-01T00:00:00Z");
      await plan(ordered.id, "completed", null, "2026-03-01T00:00:00Z", true); // deleted — ignored
      await plan(draft.id, "initiated", { orthoapneaDraft: { step: 1 } }, "2026-02-01T00:00:00Z");

      const { items } = await GetPatientListQuery(ctx, { search: lastName });
      const byId = new Map(items.map((i) => [i.id, i.device_order]));

      expect(byId.get(none.id)).toBeNull();
      expect(byId.get(ordered.id)).toEqual({
        status: "in_progress", metadata: null, order_sync_status: null, appliance_delivered_at: null,
      });
      expect(byId.get(draft.id)).toMatchObject({ status: "initiated", metadata: { orthoapneaDraft: true } });
    });
  });
});
