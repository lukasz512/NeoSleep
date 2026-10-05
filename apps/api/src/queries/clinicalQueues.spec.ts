import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId, insertPractitioner } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { GetTreatmentPlanListQuery, GetTreatmentPlanQueueCountsQuery } from "./treatmentPlan.js";
import { GetSleepStudyListQuery, GetSleepStudyQueueCountsQuery } from "./sleepStudy.js";
import { SetTreatmentAdvanceLevelCommand } from "../commands/treatmentPlan.js";

/**
 * The doctor's Tratamientos / Estudios lists: each row's stage in the care protocol
 * (docs/clinical/protocolo-atencion), its queue chip, and the chip counts. Real Postgres.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = TenantContext["client"];

async function setup(client: Client) {
  const globalId = await getGlobalTerritoryId(client);
  const email = `qa-queues-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Queues", "admin", hash, false, null, null, globalId);
  const ctx: TenantContext = {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: globalId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
  const doctor = await insertPractitioner(client, { first_name: "Dra", last_name: `Queues${uniqueSuffix()}`, status: "active" });
  const lastName = `Queue-${uniqueSuffix()}`;

  async function patient(first: string, status = "active"): Promise<string> {
    const { rows: [identity] } = await client.query<{ id: string }>(
      `INSERT INTO identities (first_name, last_name) VALUES ($1, $2) RETURNING id`,
      [first, lastName],
    );
    const { rows: [row] } = await client.query<{ id: string }>(
      `INSERT INTO patient (identity_id, practitioner_id, status) VALUES ($1, $2, $3) RETURNING id`,
      [identity!.id, doctor.id, status],
    );
    return row!.id;
  }

  /** `daysAgo` positive = past, negative = future. */
  async function visit(patientId: string, daysAgo: number, status = "scheduled"): Promise<void> {
    await client.query(
      `INSERT INTO appointment (patient_id, practitioner_id, created_by_user_id, status, start_at, end_at)
       VALUES ($1, $2, $3, $4, now() - make_interval(days => $5), now() - make_interval(days => $5) + interval '30 min')`,
      [patientId, doctor.id, user!.id, status, daysAgo],
    );
  }

  async function study(patientId: string, fields: Record<string, unknown>): Promise<string> {
    const cols = Object.keys(fields);
    const { rows: [row] } = await client.query<{ id: string }>(
      `INSERT INTO sleep_study (patient_id, ${cols.join(", ")})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
      [patientId, ...Object.values(fields)],
    );
    return row!.id;
  }

  async function plan(patientId: string, fields: Record<string, unknown>): Promise<string> {
    const cols = Object.keys(fields);
    const { rows: [row] } = await client.query<{ id: string }>(
      `INSERT INTO treatment_plan (patient_id, type, ${cols.join(", ")})
       VALUES ($1, 'dental_appliance', ${cols.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
      [patientId, ...Object.values(fields).map((v) => (v && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v))],
    );
    return row!.id;
  }

  return { ctx, lastName, patient, visit, study, plan };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("treatment plan progress (doctor's Tratamientos list)", () => {
  it("derives stage, due date, action flag and queue from the order and the visits", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, lastName, patient, visit, study, plan } = await setup(client);

      const draftP = await patient("Draft");
      const draft = await plan(draftP, { status: "initiated", metadata: { orthoapneaDraft: { step: 2 } } });

      const labP = await patient("AtLab");
      const atLab = await plan(labP, { status: "in_progress", created_at: daysAgo(3) });

      const bookedP = await patient("Booked");
      const booked = await plan(bookedP, { status: "in_progress", created_at: daysAgo(3) });
      await visit(bookedP, -10);

      const lateP = await patient("Late");
      const baseline = await study(lateP, { status: "interpreted", ahi_score: 31.5, created_at: daysAgo(60) });
      const late = await plan(lateP, {
        status: "in_progress", sleep_study_id: baseline, appliance_delivered_at: daysAgo(20),
        created_at: daysAgo(50), metadata: { advance_level: 2 },
      });
      await visit(lateP, 20); // delivery day itself — not a control
      await study(lateP, { status: "interpreted", ahi_score: 6.2, created_at: daysAgo(1) });

      const secondP = await patient("Second");
      const second = await plan(secondP, { status: "completed", appliance_delivered_at: daysAgo(40), created_at: daysAgo(70) });
      await visit(secondP, 25);
      await visit(secondP, -3);
      await visit(secondP, 10, "cancelled");

      const followP = await patient("Follow");
      const follow = await plan(followP, { status: "in_progress", appliance_delivered_at: daysAgo(100), created_at: daysAgo(120) });
      await visit(followP, 85);
      await visit(followP, 70);
      await visit(followP, 8);

      const cancelledP = await patient("Cancelled");
      const cancelled = await plan(cancelledP, { status: "cancelled" });
      const dischargedP = await patient("Discharged", "discharged");
      const discharged = await plan(dischargedP, { status: "in_progress", appliance_delivered_at: daysAgo(200) });

      const { items } = await GetTreatmentPlanListQuery(ctx, { search: lastName, limit: 50 });
      const byId = new Map(items.map((i) => [i.id, i.progress]));

      expect(byId.get(draft)).toMatchObject({ stage: "scan", needs_action: true, overdue: false, queue: "action", due_at: null });
      expect(byId.get(atLab)).toMatchObject({ stage: "delivery", needs_action: true, overdue: false, queue: "action" });
      expect(byId.get(booked)).toMatchObject({ stage: "delivery", needs_action: false, queue: "active" });
      expect(byId.get(booked)?.next_visit_at).not.toBeNull();
      expect(byId.get(late)).toMatchObject({
        stage: "control_1", needs_action: true, overdue: true, queue: "action",
        advance_level: 2, ahi_baseline: 31.5, ahi_latest: 6.2,
      });
      expect(byId.get(second)).toMatchObject({ stage: "control_2", needs_action: false, queue: "active" });
      expect(byId.get(follow)).toMatchObject({ stage: "follow_up", needs_action: false, overdue: false, queue: "follow_up" });
      // 6-month control: delivered 100 days ago → ~82 days ahead.
      const followDue = new Date(byId.get(follow)!.due_at!).getTime();
      expect(followDue).toBeGreaterThan(Date.now() + 70 * 86_400_000);
      expect(byId.get(cancelled)).toMatchObject({ stage: "done", needs_action: false, overdue: false, queue: "done" });
      expect(byId.get(discharged)).toMatchObject({ stage: "done", queue: "done" });

      const counts = await GetTreatmentPlanQueueCountsQuery(ctx, { search: lastName });
      expect(counts).toEqual({ action: 3, active: 2, follow_up: 1, done: 2 });

      // A chip filters the list and sorts by priority: overdue first.
      const action = await GetTreatmentPlanListQuery(ctx, { search: lastName, queue: "action", limit: 50 });
      expect(action.total).toBe(3);
      expect(action.items[0]?.id).toBe(late);
      expect(new Set(action.items.map((i) => i.id))).toEqual(new Set([late, draft, atLab]));
    });
  });
});

describe("SetTreatmentAdvanceLevelCommand", () => {
  it("sets and clears metadata.advance_level, keeps other metadata, audits, rejects bad levels", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patient, plan } = await setup(client);
      const p = await patient("Advance");
      const id = await plan(p, { status: "completed", metadata: { orthoapneaDraft: false, note: "keep" } });
      const { rows: [before] } = await client.query<{ updated_at: Date }>(`SELECT updated_at FROM treatment_plan WHERE id = $1`, [id]);

      const set = await SetTreatmentAdvanceLevelCommand(ctx, id, 3);
      expect(set.metadata).toEqual({ orthoapneaDraft: false, note: "keep", advance_level: 3 });
      // updated_at stands in for the delivery of a completed plan — a level change must not move it.
      expect(set.updated_at).toBe(before!.updated_at.toISOString());

      const cleared = await SetTreatmentAdvanceLevelCommand(ctx, id, null);
      expect(cleared.metadata).toEqual({ orthoapneaDraft: false, note: "keep" });

      const { rows: audits } = await client.query(
        `SELECT entity_after FROM audit_log WHERE entity_type = 'TreatmentPlan' AND entity_id = $1 ORDER BY created_at`,
        [id],
      );
      expect(audits.map((a) => a.entity_after)).toEqual([{ advance_level: 3 }, { advance_level: null }]);

      await expect(SetTreatmentAdvanceLevelCommand(ctx, id, 0)).rejects.toThrow(/advance_level/);
      await expect(SetTreatmentAdvanceLevelCommand(ctx, id, 2.5)).rejects.toThrow(/advance_level/);
    });
  });
});

describe("sleep study progress (doctor's Estudios list)", () => {
  it("names the next step, the phase and the queue", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, lastName, patient, study, plan } = await setup(client);

      const a = await patient("Ordered");
      const ordered = await study(a, { status: "ordered" });
      const b = await patient("Recording");
      const recording = await study(b, { status: "device_delivered", device_delivered_at: daysAgo(2) });
      const c = await patient("NotBack");
      const notBack = await study(c, { status: "device_delivered", device_delivered_at: daysAgo(8) });
      const d = await patient("Results");
      const results = await study(d, { status: "results_received", results_received_at: daysAgo(4), ahi_score: 34.1 });
      const e = await patient("Candidate");
      const candidate = await study(e, { status: "interpreted", ahi_score: 23.4 });
      const f = await patient("NotCandidate");
      const notCandidate = await study(f, { status: "interpreted", oa_indicated: false });
      const g = await patient("Planned");
      const planned = await study(g, { status: "interpreted", created_at: daysAgo(90) });
      await plan(g, { status: "in_progress", sleep_study_id: planned, created_at: daysAgo(80) });
      const control = await study(g, { status: "interpreted", ahi_score: 6, created_at: daysAgo(1) });

      const { items } = await GetSleepStudyListQuery(ctx, { search: lastName, limit: 50 });
      const byId = new Map(items.map((i) => [i.id, i.progress]));

      expect(byId.get(ordered)).toMatchObject({ next_step: "hand_sensor", phase: "initial", queue: "active", needs_action: false });
      expect(byId.get(recording)).toMatchObject({ next_step: "recording", queue: "active" });
      expect(byId.get(notBack)).toMatchObject({ next_step: "sensor_overdue", queue: "action", needs_action: true });
      expect(byId.get(results)).toMatchObject({ next_step: "to_interpret", queue: "action" });
      expect(byId.get(candidate)).toMatchObject({ next_step: "schedule_scan", queue: "action" });
      expect(byId.get(notCandidate)).toMatchObject({ next_step: "not_candidate", queue: "done" });
      expect(byId.get(planned)).toMatchObject({ next_step: "plan_started", phase: "initial", queue: "done" });
      expect(byId.get(control)).toMatchObject({ next_step: "review_discharge", phase: "control", queue: "action" });

      const counts = await GetSleepStudyQueueCountsQuery(ctx, { search: lastName });
      expect(counts).toEqual({ action: 4, active: 2, done: 2 });

      // Longest waiting first within the action chip.
      const action = await GetSleepStudyListQuery(ctx, { search: lastName, queue: "action", limit: 50 });
      expect(action.items.map((i) => i.id).slice(0, 1)).toEqual([notBack]);
    });
  });
});
