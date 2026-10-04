import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../../src/server.js";
import { withTenant, insertStaffUser } from "../../src/db.js";
import { __setLabOrdersDeployEnvForTests, getLabOrdersSendConfig, setLabOrdersSendEnabled } from "../../src/db/config.js";
import { __resetOrthoApneaStateForTests, __setOrthoApneaBaseUrlForTests } from "../../src/services/partners/orthoapnea.js";
import { signAuthToken } from "../../src/utils/jwt.js";
import type { StaffRole } from "../../src/db/users.js";
import { startOaReplica, type OaReplica } from "../oa-replica/server.js";
import { setup, TENANT_SLUG, uniqueSuffix, validOrder } from "./fixtures.js";

/**
 * NEO-210: the per-tenant kill switch on anything that writes to the lab —
 * order submit (POST /device-orders), "ensure lab patient" and the
 * notify-the-lab comment email (both in routes/partners/orthoapnea-treatments.ts).
 * Real Postgres ("test" tenant schema) + the in-process OA replica; the
 * fetch guard (test/fetch-guard.ts) proves zero calls reach it when the
 * switch is off, same discipline as orthoapnea-roles.spec.ts.
 */
vi.setConfig({ testTimeout: 30_000 });

let replica: OaReplica;

beforeAll(async () => {
  replica = await startOaReplica();
  __setOrthoApneaBaseUrlForTests(replica.url);
});

afterAll(async () => {
  __setOrthoApneaBaseUrlForTests(null);
  await replica.close();
});

/** Removes any explicit integrations.labOrders, so the default rule (env-based) applies. */
async function clearLabOrdersOverride(): Promise<void> {
  await withTenant(TENANT_SLUG, (client) => client.query(`UPDATE app_config SET integrations = integrations - 'labOrders'`));
}

beforeEach(async () => {
  __resetOrthoApneaStateForTests();
  replica.reset();
  __setLabOrdersDeployEnvForTests(null);
  await clearLabOrdersOverride();
});

afterEach(async () => {
  __setLabOrdersDeployEnvForTests(null);
  await clearLabOrdersOverride();
});

async function staff(role: StaffRole): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-neo210-${role}-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "KillSwitch", role, hash, false);
    return signAuthToken({ id: user!.id, email, role, token_version: 0 });
  });
}

describe("NEO-210 default rule (getLabOrdersSendConfig)", () => {
  it("prod with no explicit value: disabled", async () => {
    __setLabOrdersDeployEnvForTests("prod");
    expect(await getLabOrdersSendConfig()).toEqual({ sendEnabled: false, isExplicit: false });
  });

  it("dev with no explicit value: enabled", async () => {
    __setLabOrdersDeployEnvForTests("dev");
    expect(await getLabOrdersSendConfig()).toEqual({ sendEnabled: true, isExplicit: false });
  });

  it("local with no explicit value: enabled", async () => {
    __setLabOrdersDeployEnvForTests("local");
    expect(await getLabOrdersSendConfig()).toEqual({ sendEnabled: true, isExplicit: false });
  });

  it("an explicit value always wins, either direction", async () => {
    __setLabOrdersDeployEnvForTests("prod");
    await setLabOrdersSendEnabled(true);
    expect(await getLabOrdersSendConfig()).toEqual({ sendEnabled: true, isExplicit: true });

    __setLabOrdersDeployEnvForTests("dev");
    await setLabOrdersSendEnabled(false);
    expect(await getLabOrdersSendConfig()).toEqual({ sendEnabled: false, isExplicit: true });
  });
});

describe("NEO-210 POST /api/v1/device-orders — kill switch", () => {
  it("prod default (no explicit value) → 409 LAB_ORDERS_DISABLED, zero calls to the lab", async () => {
    __setLabOrdersDeployEnvForTests("prod");
    const s = await setup();
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAB_ORDERS_DISABLED");
    expect(replica.requests).toHaveLength(0);
  });

  it("dev default (no explicit value) → order goes through", async () => {
    __setLabOrdersDeployEnvForTests("dev");
    const s = await setup();
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(201);
  });

  it("explicit true on prod → allowed", async () => {
    __setLabOrdersDeployEnvForTests("prod");
    await setLabOrdersSendEnabled(true);
    const s = await setup();
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(201);
  });

  it("explicit false on dev → blocked, zero calls to the lab", async () => {
    __setLabOrdersDeployEnvForTests("dev");
    await setLabOrdersSendEnabled(false);
    const s = await setup();
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAB_ORDERS_DISABLED");
    expect(replica.requests).toHaveLength(0);
  });
});

describe("NEO-210 reads stay allowed when the switch is off", () => {
  it("GET /device-orders/context still answers 200 and reports sendEnabled: false", async () => {
    await setLabOrdersSendEnabled(false);
    const s = await setup();
    const res = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(res.status).toBe(200);
    expect(res.body.sendEnabled).toBe(false);
  });

  it("GET /device-orders/context reports sendEnabled: true once turned back on", async () => {
    await setLabOrdersSendEnabled(true);
    const s = await setup();
    const res = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(res.status).toBe(200);
    expect(res.body.sendEnabled).toBe(true);
  });
});

describe("NEO-210 POST /partners/orthoapnea/patients/:id/ensure — kill switch", () => {
  it("disabled → 409 LAB_ORDERS_DISABLED, zero calls to the lab", async () => {
    await setLabOrdersSendEnabled(false);
    const s = await setup();
    const res = await request(app)
      .post(`/api/v1/partners/orthoapnea/patients/${s.patientId}/ensure`)
      .set("Authorization", `Bearer ${s.token}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAB_ORDERS_DISABLED");
    expect(replica.requests).toHaveLength(0);
  });

  it("enabled → still creates the lab patient as before", async () => {
    await setLabOrdersSendEnabled(true);
    const s = await setup();
    const res = await request(app)
      .post(`/api/v1/partners/orthoapnea/patients/${s.patientId}/ensure`)
      .set("Authorization", `Bearer ${s.token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.externalId).toBeTruthy();
  });
});

describe("NEO-210 POST /partners/orthoapnea/treatments/:id/comments — kill switch", () => {
  it("disabled: the local note is still saved, the lab email is not sent, zero calls to the lab", async () => {
    await setLabOrdersSendEnabled(false);
    const s = await setup();
    const text = `neo210-killswitch-${uniqueSuffix()}`;
    const res = await request(app)
      .post(`/api/v1/partners/orthoapnea/treatments/${s.planId}/comments`)
      .set("Authorization", `Bearer ${s.token}`)
      .send({ body: text, notifyOrthoApnea: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAB_ORDERS_DISABLED");
    expect(replica.requests).toHaveLength(0);
    const { rows } = await withTenant(TENANT_SLUG, (client) => client.query("SELECT 1 FROM note WHERE body = $1", [text]));
    expect(rows).toHaveLength(1);
  });

  it("disabled: a comment with notifyOrthoApnea left out still saves the note, no lab call expected either way", async () => {
    await setLabOrdersSendEnabled(false);
    const s = await setup();
    const text = `neo210-killswitch-noop-${uniqueSuffix()}`;
    const res = await request(app)
      .post(`/api/v1/partners/orthoapnea/treatments/${s.planId}/comments`)
      .set("Authorization", `Bearer ${s.token}`)
      .send({ body: text });
    expect(res.status).toBe(201);
    expect(replica.requests).toHaveLength(0);
  });
});

describe("NEO-210 GET/PATCH /api/v1/device-orders/lab-orders-config", () => {
  it.each(["rep", "kam", "msl", "doctor", "manager"] as const)("403 for %s", async (role) => {
    const token = await staff(role);
    const getRes = await request(app).get("/api/v1/device-orders/lab-orders-config").set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(403);
    const patchRes = await request(app)
      .patch("/api/v1/device-orders/lab-orders-config")
      .set("Authorization", `Bearer ${token}`)
      .send({ sendEnabled: false });
    expect(patchRes.status).toBe(403);
  });

  it("admin: GET reads the current config, PATCH sets it and is audited", async () => {
    __setLabOrdersDeployEnvForTests("dev");
    const token = await staff("admin");

    const before = await request(app).get("/api/v1/device-orders/lab-orders-config").set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ sendEnabled: true, isExplicit: false });

    const patch = await request(app)
      .patch("/api/v1/device-orders/lab-orders-config")
      .set("Authorization", `Bearer ${token}`)
      .send({ sendEnabled: false });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ sendEnabled: false, isExplicit: true });

    const after = await request(app).get("/api/v1/device-orders/lab-orders-config").set("Authorization", `Bearer ${token}`);
    expect(after.body).toMatchObject({ sendEnabled: false, isExplicit: true });

    const { rows } = await withTenant(TENANT_SLUG, (client) =>
      client.query("SELECT action, entity_type FROM audit_log WHERE entity_type = 'AppConfig' ORDER BY created_at DESC LIMIT 1")
    );
    expect(rows[0]).toMatchObject({ action: "update", entity_type: "AppConfig" });
  });

  it("400 when sendEnabled isn't a boolean", async () => {
    const token = await staff("admin");
    const res = await request(app).patch("/api/v1/device-orders/lab-orders-config").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});
