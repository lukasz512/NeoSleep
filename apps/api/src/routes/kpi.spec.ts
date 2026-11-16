import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";

// env.ts reads INTERNAL_JOB_SECRET at import time — set it before server.js loads.
const JOB_SECRET = vi.hoisted(() => {
  const secret = `kpi-job-${Math.random().toString(36).slice(2)}`;
  process.env.INTERNAL_JOB_SECRET = secret;
  return secret;
});

import { app } from "../server.js";
import { withTenant, insertPatient, insertStaffUser } from "../db.js";
import { listDailyKpiSnapshot, type KpiSnapshotRow } from "../db/kpiSnapshot.js";
import { parseKpiDay, previousUtcDay } from "../commands/kpiSnapshot.js";

/**
 * CORE-213: the nightly job freezes the dashboard counts into kpi_snapshot, through
 * the real Express stack and real Postgres. Fixtures are backdated to a random day
 * in the 1990s, so other specs writing "today" can't change these counts.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function randomPastDay(): string {
  const d = new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 3650) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function job(day?: string, secret = JOB_SECRET) {
  return request(app).post("/api/v1/kpi/jobs/snapshot").set("Authorization", `Bearer ${secret}`).send(day ? { day } : {});
}

function pick(rows: KpiSnapshotRow[], scope: KpiSnapshotRow["scope_type"], metric: string, scopeId: string | null = null): number | undefined {
  return rows.find((r) => r.scope_type === scope && r.metric === metric && r.scope_id === scopeId)?.value;
}

/** Two encounters by one rep in one territory that day (one submitted that day), one the day after, a patient, an order. */
async function seedDay(day: string): Promise<{ userId: string; territoryId: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const at = `${day}T10:00:00Z`;
    const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000 + 3_600_000).toISOString();
    const user = await insertStaffUser(client, `qa-kpi-${randomUUID()}@neosleepcare.com`, "QA", "Kpi", "rep", null, false);
    const { rows: territory } = await client.query<{ id: string }>(
      `INSERT INTO territory (name, country_code) VALUES ($1, 'MX') RETURNING id`,
      [`QA KPI ${randomUUID()}`]
    );
    const patient = await insertPatient(client, { first_name: "Kpi", last_name: `Day-${randomUUID()}`, region: "MX" });
    await client.query(`UPDATE patient SET created_at = $2 WHERE id = $1`, [patient.id, at]);
    await client.query(
      `INSERT INTO encounter (user_id, territory_id, start_at, submitted_at, created_at) VALUES
         ($1, $2, $3, $3, $3), ($1, $2, $3, NULL, $3), ($1, $2, $4, NULL, $4)`,
      [user!.id, territory[0]!.id, at, nextDay]
    );
    await client.query(`INSERT INTO purchase_order (patient_id, subtotal, total, created_at) VALUES ($1, 10, 10, $2)`, [patient.id, at]);
    return { userId: user!.id, territoryId: territory[0]!.id };
  });
}

describe("POST /api/v1/kpi/jobs/snapshot", () => {
  it("writes the day's counts per tenant, rep and territory", async () => {
    const day = randomPastDay();
    const { userId, territoryId } = await seedDay(day);

    const res = await job(day);
    expect(res.status).toBe(200);
    expect(res.body.day).toBe(day);
    expect(res.body.tenantsFailed).toBe(0);

    const rows = await withTenant(TENANT_SLUG, (client) => listDailyKpiSnapshot(client, day));
    expect(pick(rows, "tenant", "patients_created")).toBe(1);
    expect(pick(rows, "tenant", "encounters")).toBe(2);
    expect(pick(rows, "tenant", "pcfs_submitted")).toBe(1);
    expect(pick(rows, "tenant", "purchase_orders")).toBe(1);
    expect(pick(rows, "tenant", "device_orders_sent")).toBe(0);
    expect(pick(rows, "user", "encounters", userId)).toBe(2);
    expect(pick(rows, "user", "pcfs_submitted", userId)).toBe(1);
    expect(pick(rows, "territory", "encounters", territoryId)).toBe(2);
  });

  it("replaces the day on a rerun instead of adding to it", async () => {
    const day = randomPastDay();
    const { userId } = await seedDay(day);
    await job(day);
    await withTenant(TENANT_SLUG, (client) => client.query(`UPDATE encounter SET deleted_at = now() WHERE user_id = $1 AND submitted_at IS NULL`, [userId]));
    expect((await job(day)).status).toBe(200);

    const rows = await withTenant(TENANT_SLUG, (client) => listDailyKpiSnapshot(client, day));
    expect(rows.filter((r) => r.scope_type === "tenant" && r.metric === "encounters")).toHaveLength(1);
    expect(pick(rows, "tenant", "encounters")).toBe(1);
    expect(pick(rows, "user", "encounters", userId)).toBe(1);
  });

  it("is machine-to-machine only and takes past days only", async () => {
    expect((await job(undefined, "nope")).status).toBe(401);
    expect((await request(app).post("/api/v1/kpi/jobs/snapshot").send({})).status).toBe(401);
    const today = new Date().toISOString().slice(0, 10);
    expect((await job(today)).status).toBe(400);
    expect((await job("2026-02-30")).status).toBe(400);
  });

  it("defaults to yesterday, UTC", () => {
    const now = new Date("2026-03-01T00:30:00Z");
    expect(previousUtcDay(now)).toBe("2026-02-28");
    expect(parseKpiDay(undefined, now)).toBe("2026-02-28");
  });
});
