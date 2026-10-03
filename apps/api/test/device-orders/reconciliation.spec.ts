import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { withTenant } from "../../src/db.js";
import {
  RunDeviceOrderReconciliationCommand,
  RunDeviceOrderReconciliationAllTenantsCommand,
} from "../../src/commands/deviceOrderReconciliation.js";
import type { ReconciliationAlert } from "../../src/mailer.js";
import { ENV_TAG_NOTE, formatEnvTag, type ReconciliationItem } from "../../src/services/deviceOrders/reconcile.js";
import { DEPLOY_ENV } from "../../src/env.js";
import { __resetOrthoApneaStateForTests, __setOrthoApneaBaseUrlForTests } from "../../src/services/partners/orthoapnea.js";
import { signAuthToken } from "../../src/utils/jwt.js";
import { startOaReplica, type OaReplica } from "../oa-replica/server.js";
import { setup, TENANT_SLUG, validOrder, type Setup } from "./fixtures.js";

/**
 * Device-order reconciliation (NEO-218) end to end: real Postgres ("test"
 * tenant schema), real HTTP to the in-process OrthoApnea replica. The fetch
 * guard (test/fetch-guard.ts) makes sure nothing reaches the real OA.
 *
 * Each test starts from an empty set of OrthoApnea order links in the test
 * schema, so the counts are this test's own.
 */
vi.setConfig({ testTimeout: 60_000 });

const LIST = "/api/treatments/DTO";
let replica: OaReplica;

beforeAll(async () => {
  replica = await startOaReplica();
  __setOrthoApneaBaseUrlForTests(replica.url);
});

afterAll(async () => {
  __setOrthoApneaBaseUrlForTests(null);
  await replica.close();
});

beforeEach(async () => {
  __resetOrthoApneaStateForTests();
  replica.reset();
  await withTenant(TENANT_SLUG, async (client) => {
    await client.query("DELETE FROM partner_link WHERE partner = 'orthoapnea' AND entity_type = 'treatment_plan'");
    await client.query("DELETE FROM device_order_reconciliation_run");
  });
});

/** Places one order through the real route (validated, sent to the replica); returns OA's id. */
async function placeOrder(s: Setup): Promise<number> {
  const res = await request(app)
    .post("/api/v1/device-orders")
    .set("Authorization", `Bearer ${s.token}`)
    .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
  expect(res.status).toBe(201);
  return Number(res.body.externalId);
}

async function checkNow(token: string) {
  return request(app).post("/api/v1/device-orders/reconciliation/run").set("Authorization", `Bearer ${token}`).send({});
}

function itemFor(items: ReconciliationItem[], externalId: number): ReconciliationItem | undefined {
  return items.find((i) => i.externalId === String(externalId));
}

describe("POST /api/v1/device-orders/reconciliation/run (Check now)", () => {
  it("every order we placed is in OA unchanged → ok, 100%", async () => {
    const a = await setup();
    const b = await setup();
    const idA = await placeOrder(a);
    const idB = await placeOrder(b);

    const res = await checkNow(a.token);

    expect(res.status).toBe(201);
    expect(res.body.environment).toBe(DEPLOY_ENV);
    const run = res.body.run;
    expect(run).toMatchObject({ status: "ok", trigger: "manual", triggered_by: a.userId, error: null });
    expect(run.summary).toMatchObject({ oursSent: 2, labTotal: 2, matched: 2, mismatches: 0, matchLevel: 1 });
    expect(itemFor(run.items, idA)).toMatchObject({ reason: "matched", treatmentPlanId: a.planId, labStatus: "1" });
    expect(itemFor(run.items, idB)).toMatchObject({ reason: "matched", treatmentPlanId: b.planId });
  });

  it("a placed order carries this environment's tag line in OA's notes, and still matches (D1)", async () => {
    const a = await setup();
    const id = await placeOrder(a);
    const notes = String(replica.treatments.get(id)!.observations);
    expect(notes).toBe(`QA replica order\n${formatEnvTag(DEPLOY_ENV, a.planId)} — ${ENV_TAG_NOTE}`);

    const run = (await checkNow(a.token)).body.run;
    expect(itemFor(run.items, id)!.reason).toBe("matched");
  });

  it("only GET requests reach OA during a run (it can never place or change an order)", async () => {
    const a = await setup();
    await placeOrder(a);
    const before = replica.requests.length;

    await checkNow(a.token);

    const during = replica.requests.slice(before).filter((r) => r.path !== "/api/login");
    expect(during.length).toBeGreaterThan(0);
    expect(during.every((r) => r.method === "GET")).toBe(true);
    expect(replica.count("GET", LIST)).toBeGreaterThan(0);
  });

  it("a field changed on OA's side → field_drift naming the field, ours vs OA", async () => {
    const a = await setup();
    const id = await placeOrder(a);
    replica.treatments.get(id)!.protrusionMax = 3;

    const run = (await checkNow(a.token)).body.run;

    expect(run.status).toBe("mismatch");
    expect(itemFor(run.items, id)).toMatchObject({ reason: "field_drift", drift: [{ field: "protrusionMax", ours: "6", lab: "3" }] });
    expect(run.summary.matchLevel).toBe(0);
  });

  it("OA's upper-cased delivery address is not a drift", async () => {
    const a = await setup();
    const id = await placeOrder(a);
    // The replica stores the address upper-cased, exactly as OA did for 454012.
    expect(String((replica.treatments.get(id)!.deliveryAddress as { city: string }).city)).toBe("CIUDAD DE MEXICO");

    const run = (await checkNow(a.token)).body.run;
    expect(itemFor(run.items, id)!.reason).toBe("matched");
  });

  it("an order OA no longer lists → missing_in_lab", async () => {
    const a = await setup();
    const id = await placeOrder(a);
    replica.treatments.delete(id);

    const run = (await checkNow(a.token)).body.run;
    expect(run.status).toBe("mismatch");
    expect(itemFor(run.items, id)).toMatchObject({ reason: "missing_in_lab", treatmentPlanId: a.planId });
  });

  it("orders only OA has are explained: test shot, other environment, unknown, and untracked (tagged by us, no link)", async () => {
    const a = await setup();
    const other = DEPLOY_ENV === "prod" ? "dev" : "prod";
    // The captured order's patient is "Tester Patient 3"; a real outside order has a real name.
    const real = { patientName: "Paciente Externo" };
    const test = replica.seedTreatment({ observations: "PEDIDO DE PRUEBA 7 – NeoSleep" });
    const otherEnv = replica.seedTreatment({ ...real, observations: formatEnvTag(other, crypto.randomUUID()) });
    const untagged = replica.seedTreatment({ ...real, observations: "Paciente remitido" });
    const untracked = replica.seedTreatment({ ...real, observations: formatEnvTag(DEPLOY_ENV, crypto.randomUUID()) });

    const run = (await checkNow(a.token)).body.run;

    expect(itemFor(run.items, test)!.reason).toBe("test_order");
    expect(itemFor(run.items, otherEnv)!.reason).toBe("other_env");
    expect(itemFor(run.items, untagged)!.reason).toBe(DEPLOY_ENV === "prod" ? "outside" : "unknown_env");
    expect(itemFor(run.items, untracked)!.reason).toBe("untracked");
    expect(run.summary).toMatchObject({ oursSent: 0, labTotal: 4, mismatches: 1, info: 3 });
  });

  it("reads every page of OA's list", async () => {
    const a = await setup();
    for (let i = 0; i < 130; i++) replica.seedTreatment({ observations: "PEDIDO DE PRUEBA" });

    const run = (await checkNow(a.token)).body.run;

    expect(run.summary.labTotal).toBe(130);
    expect(replica.count("GET", LIST)).toBe(2);
  });

  it("OA can't be read → a failed run with the error, and no order reported missing", async () => {
    const a = await setup();
    await placeOrder(a);
    replica.failNext(LIST, 500);

    const run = (await checkNow(a.token)).body.run;

    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/500/);
    expect(run.items).toEqual([]);
    expect(run.summary).toEqual({ oursSent: 1 });
  });

  it("403 for a manager and a rep (Check now is admin only)", async () => {
    const m = await setup(undefined, "manager");
    expect((await checkNow(m.token)).status).toBe(403);
    const repToken = signAuthToken({ id: crypto.randomUUID(), email: "qa-rep@example.com", role: "rep", token_version: 0 });
    expect((await checkNow(repToken)).status).toBe(403);
    expect(replica.count("GET", LIST)).toBe(0);
  });
});

describe("GET /api/v1/device-orders/reconciliation/latest", () => {
  it("admin gets the full run and the read is audited; manager gets the counter only", async () => {
    const a = await setup();
    const m = await setup(undefined, "manager");
    const id = await placeOrder(a);
    const runId = (await checkNow(a.token)).body.run.id as string;

    const admin = await request(app).get("/api/v1/device-orders/reconciliation/latest").set("Authorization", `Bearer ${a.token}`);
    expect(admin.status).toBe(200);
    expect(admin.body.run.id).toBe(runId);
    expect(itemFor(admin.body.run.items, id)!.reason).toBe("matched");
    expect(admin.body.counter).toMatchObject({ status: "ok", matchLevel: 1, matched: 1, mismatches: 0 });

    const reads = await withTenant(TENANT_SLUG, (client) =>
      client.query("SELECT 1 FROM audit_log WHERE entity_type = 'DeviceOrderReconciliation' AND action = 'read' AND entity_id = $1 AND user_id = $2", [runId, a.userId])
    );
    expect(reads.rowCount).toBe(1);

    const manager = await request(app).get("/api/v1/device-orders/reconciliation/latest").set("Authorization", `Bearer ${m.token}`);
    expect(manager.status).toBe(200);
    expect(manager.body.counter).toMatchObject({ status: "ok", matchLevel: 1 });
    expect(manager.body).not.toHaveProperty("run");
    expect(JSON.stringify(manager.body)).not.toContain(String(id));
  });

  it("before any run: counter null", async () => {
    const a = await setup();
    const res = await request(app).get("/api/v1/device-orders/reconciliation/latest").set("Authorization", `Bearer ${a.token}`);
    expect(res.body).toMatchObject({ counter: null, run: null });
  });

  it("403 for a rep", async () => {
    const repToken = signAuthToken({ id: crypto.randomUUID(), email: "qa-rep@example.com", role: "rep", token_version: 0 });
    expect((await request(app).get("/api/v1/device-orders/reconciliation/latest").set("Authorization", `Bearer ${repToken}`)).status).toBe(403);
  });
});

describe("daily job", () => {
  it("POST /device-orders/jobs/reconcile without the job secret → 401, OA untouched", async () => {
    const res = await request(app).post("/api/v1/device-orders/jobs/reconcile").send({});
    expect(res.status).toBe(401);
    expect(replica.requests).toHaveLength(0);
  });

  it("the job takes only its own secret (D2): the shared job secret is refused, its own runs every tenant", async () => {
    const previous = process.env.RECONCILIATION_JOB_SECRET;
    process.env.RECONCILIATION_JOB_SECRET = "qa-reconciliation-job-secret";
    try {
      const wrong = await request(app).post("/api/v1/device-orders/jobs/reconcile").set("Authorization", "Bearer some-other-job-secret").send({});
      expect(wrong.status).toBe(401);

      const ok = await request(app).post("/api/v1/device-orders/jobs/reconcile").set("Authorization", "Bearer qa-reconciliation-job-secret").send({});
      expect(ok.status).toBe(200);
      expect(ok.body.tenantsFailed).toBe(0);
      expect(ok.body.tenants[TENANT_SLUG]).toMatchObject({ status: "ok" });
    } finally {
      if (previous === undefined) delete process.env.RECONCILIATION_JOB_SECRET;
      else process.env.RECONCILIATION_JOB_SECRET = previous;
    }
  });

  it("a scheduled run with a mismatch emails every active admin; counts and OA numbers only, no patient name", async () => {
    const a = await setup();
    const id = await placeOrder(a);
    replica.treatments.get(id)!.retrusionMax = -2;
    const sent: { to: string; alert: ReconciliationAlert }[] = [];

    const result = await RunDeviceOrderReconciliationAllTenantsCommand("test-job", { sendAlert: async (to, alert) => void sent.push({ to, alert }) });

    expect(result.tenants[TENANT_SLUG]).toMatchObject({ status: "mismatch" });
    const email = (await withTenant(TENANT_SLUG, (c) => c.query<{ email: string }>("SELECT i.email FROM users u JOIN identities i ON i.id = u.identity_id WHERE u.id = $1", [a.userId]))).rows[0]!.email;
    const mine = sent.find((s) => s.to === email);
    expect(mine?.alert).toMatchObject({ status: "mismatch", mismatches: 1, matched: 0 });
    expect(mine!.alert.lines).toEqual([`field drift — lab order ${id} (retrusionMax)`]);
    expect(JSON.stringify(mine!.alert)).not.toMatch(/Tester|Patient-/);
  });

  it("a scheduled run that can't read OA alerts too; a clean one sends nothing", async () => {
    const a = await setup();
    await placeOrder(a);
    const sent: ReconciliationAlert[] = [];
    const sendAlert = async (_to: string, alert: ReconciliationAlert) => void sent.push(alert);

    await RunDeviceOrderReconciliationCommand(TENANT_SLUG, { trigger: "scheduled", userId: null, requestId: "t", sendAlert });
    expect(sent).toHaveLength(0);

    replica.failNext(LIST, 503);
    const failed = await RunDeviceOrderReconciliationCommand(TENANT_SLUG, { trigger: "scheduled", userId: null, requestId: "t", sendAlert });
    expect(failed.status).toBe("failed");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((s) => s.status === "failed" && /503/.test(s.error ?? ""))).toBe(true);
  });

  it("a manual run never emails (the admin is looking at it)", async () => {
    const a = await setup();
    const id = await placeOrder(a);
    replica.treatments.delete(id);
    const sent: ReconciliationAlert[] = [];

    const run = await RunDeviceOrderReconciliationCommand(TENANT_SLUG, {
      trigger: "manual",
      userId: a.userId,
      requestId: "t",
      sendAlert: async (_to, alert) => void sent.push(alert),
    });
    expect(run.status).toBe("mismatch");
    expect(sent).toHaveLength(0);
  });

  it("runs older than 90 days are pruned by the next run", async () => {
    const a = await setup();
    await withTenant(TENANT_SLUG, (client) =>
      client.query(
        `INSERT INTO device_order_reconciliation_run (provider, trigger, status, started_at, finished_at)
         VALUES ('orthoapnea', 'scheduled', 'ok', now() - interval '91 days', now() - interval '91 days'),
                ('orthoapnea', 'scheduled', 'ok', now() - interval '89 days', now() - interval '89 days')`
      )
    );

    await checkNow(a.token);

    const { rows } = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ age: number }>("SELECT extract(day FROM now() - started_at)::int AS age FROM device_order_reconciliation_run ORDER BY started_at")
    );
    expect(rows.map((r) => r.age)).toEqual([89, 0]);
  });
});
