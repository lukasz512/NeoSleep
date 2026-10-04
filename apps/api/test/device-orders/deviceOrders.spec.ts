import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { RULES_VERSION } from "@neo/device-order";
import { app } from "../../src/server.js";
import { withTenant, getAuditLogForEntities, insertStaffUser } from "../../src/db.js";
import { getPartnerLink } from "../../src/db/partnerLink.js";
import {
  __resetOrthoApneaStateForTests,
  __setOrthoApneaBaseUrlForTests,
  createOrthoApneaTreatment,
  ensureOrthoApneaPatient,
  orthoApneaRawRequest,
  orthoApneaTreatmentForm,
  RECONCILE_AFTER_MS,
} from "../../src/services/partners/orthoapnea.js";
import { ConflictError } from "../../src/errors.js";
import { signAuthToken } from "../../src/utils/jwt.js";
import { startOaReplica, type OaReplica } from "../oa-replica/server.js";
import { addClinic, COMPLETE_HCO, doctorLoginFor, setup, TENANT_SLUG, uniqueSuffix, validOrder, type Setup } from "./fixtures.js";

/**
 * POST /api/v1/device-orders and GET /api/v1/device-orders/context (CORE-95)
 * end to end: real Postgres ("test" tenant schema), real HTTP to the
 * in-process OrthoApnea replica — no fetch stub, and the fetch guard
 * (test/fetch-guard.ts) makes sure nothing reaches the real OA.
 */
vi.setConfig({ testTimeout: 30_000 });

const TREATMENTS = "/api/treatments";
const RECONCILE_AFTER_MINUTES = RECONCILE_AFTER_MS / 60_000;

let replica: OaReplica;

beforeAll(async () => {
  replica = await startOaReplica();
  __setOrthoApneaBaseUrlForTests(replica.url);
});

afterAll(async () => {
  __setOrthoApneaBaseUrlForTests(null);
  await replica.close();
});

beforeEach(() => {
  __resetOrthoApneaStateForTests();
  replica.reset();
});

const createdPartnerLinkIds: string[] = [];
afterEach(async () => {
  if (createdPartnerLinkIds.length > 0) {
    const ids = createdPartnerLinkIds.splice(0, createdPartnerLinkIds.length);
    await withTenant(TENANT_SLUG, (client) => client.query("DELETE FROM partner_link WHERE id = ANY($1)", [ids]));
  }
});

async function trackLink(planId: string): Promise<void> {
  const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", planId));
  if (link) createdPartnerLinkIds.push(link.id);
}

describe("POST /api/v1/device-orders", () => {
  it("401 without a token, 403 for a rep (reps can't place real orders, NEO-199)", async () => {
    expect((await request(app).post("/api/v1/device-orders").send({})).status).toBe(401);
    const repToken = signAuthToken({ id: crypto.randomUUID(), email: "qa-rep@example.com", role: "rep", token_version: 0 });
    const res = await request(app).post("/api/v1/device-orders").set("Authorization", `Bearer ${repToken}`).send({});
    expect(res.status).toBe(403);
    expect(replica.requests).toHaveLength(0);
  });

  it("400 with field issues for an invalid order — and OrthoApnea receives nothing", async () => {
    const s = await setup();
    const order = validOrder(s.dentistId, { retrusionMaxMm: 0, protrusionMaxMm: 0, startingPoint: { unit: "mm", value: null } });
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: { ...order, upperBand: 9 } });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "validation", rulesVersion: RULES_VERSION, warnings: [] });
    expect(res.body.fields).toEqual(expect.arrayContaining([{ path: "upperBand", code: "outOfRange", params: { max: 6 } }]));
    expect(replica.count("POST", TREATMENTS)).toBe(0);
    expect(replica.requests).toHaveLength(0);
  });

  it("400 with cross-field issues (MR/MP zero, no starting point)", async () => {
    const s = await setup();
    const order = validOrder(s.dentistId, { retrusionMaxMm: 0, protrusionMaxMm: 0, startingPoint: { unit: "mm", value: null } });
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        { path: "protrusionMaxMm", code: "advanceZero" },
        { path: "startingPoint.value", code: "required" },
      ])
    );
    expect(replica.requests).toHaveLength(0);
  });

  it("400 with delivery issues when the dentist's primary HCO is incomplete — zero OrthoApnea calls", async () => {
    const s = await setup({ ...COMPLETE_HCO, phone: undefined, postal_code: undefined });
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        { path: "delivery.phone", code: "required" },
        { path: "delivery.postalCode", code: "required" },
      ])
    );
    expect(replica.requests).toHaveLength(0);
  });

  it("400 delivery required when the dentist has no HCO at all", async () => {
    const s = await setup(null);
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual([{ path: "delivery", code: "required" }]);
    expect(replica.requests).toHaveLength(0);
  });

  it("400 desiredDateTooEarly against OA's manufacturing date — no patient or order is created", async () => {
    const s = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId, { desiredDate: today }) });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual([{ path: "desiredDate", code: "desiredDateTooEarly", params: { min: expect.any(String) } }]);
    expect(replica.count("POST", "/api/patient")).toBe(0);
    expect(replica.count("POST", TREATMENTS)).toBe(0);
  });

  it("400 warningNotConfirmed for an advance under 5 mm the doctor didn't confirm (Łukasz D1) — OrthoApnea receives nothing", async () => {
    const s = await setup();
    const order = validOrder(s.dentistId, { protrusionMaxMm: -1, retrusionMaxMm: -4, startingPoint: { unit: "mm", value: -2 } });
    const { acknowledgedWarnings: _old, ...oldClientOrder } = order;
    for (const body of [order, oldClientOrder]) {
      const res = await request(app)
        .post("/api/v1/device-orders")
        .set("Authorization", `Bearer ${s.token}`)
        .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: body });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ path: "protrusionMaxMm", code: "warningNotConfirmed", params: { warning: "advanceUnder5" } }]);
      expect(res.body.warnings).toEqual([{ path: "protrusionMaxMm", code: "advanceUnder5", params: { min: 5 } }]);
    }
    expect(replica.requests).toHaveLength(0);
  });

  it("201 through the replica: multipart DTO, partner_link synced, audit row with the DTO + rulesVersion", async () => {
    const s = await setup();
    const order = validOrder(s.dentistId, {
      protrusionMaxMm: -1,
      retrusionMaxMm: -4,
      startingPoint: { unit: "mm", value: -2 },
      acknowledgedWarnings: ["advanceUnder5"],
      registration: { method: "scanner", scannerTreatment: "MEDIT" },
    });
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .set("User-Agent", "neo210-audit-test")
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order });
    await trackLink(s.planId);

    expect(res.status).toBe(201);
    expect(res.body.externalStatus).toBe("1");
    // 3 mm advance range, confirmed by the doctor: still reported as OA's warning, no longer blocking.
    expect(res.body.warnings).toEqual([{ path: "protrusionMaxMm", code: "advanceUnder5", params: { min: 5 } }]);

    // Exactly one order, sent the way OA's portal sends it.
    const posts = replica.requests.filter((r) => r.method === "POST" && r.path === TREATMENTS);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.contentType).toMatch(/^multipart\/form-data/);
    const dto = posts[0]!.body as Record<string, unknown>;
    expect(dto).toMatchObject({ retrusionMax: -4, protrusionMax: -1, startingPoint: -2, sequenceTypeStandard: true, sequence: {} });
    expect(dto.deliveryAddress).toMatchObject({ address: COMPLETE_HCO.address_line1, countryId: 29, active: true });
    expect(dto).not.toHaveProperty("startingPointPorcentage");
    // Łukasz D2: the scanner goes as OA's enum name, the platform nulled; no promotion code, ever.
    expect(dto).toMatchObject({ scannerTreatment: "MEDIT", scannerPlatform: null, promotionCode: null });
    expect(dto).not.toHaveProperty("acknowledgedWarnings");

    // The OA patient got what our record has (OA's form requires birthDate + country).
    const patientPost = replica.requests.find((r) => r.method === "POST" && r.path === "/api/patient");
    expect(patientPost?.body).toMatchObject({ birthDate: "1975-06-15T00:00:00", male: true, countryId: 29, userId: 15682 });
    expect(dto.patientId).toBe(Number(replica.patients.keys().next().value));

    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    expect(link).toMatchObject({ sync_status: "synced", external_id: res.body.externalId, external_status: "1" });

    const audit = await withTenant(TENANT_SLUG, (client) => getAuditLogForEntities(client, ["PartnerOrder"], [s.planId]));
    const created = audit.find((e) => e.action === "create");
    expect(created).toBeDefined();
    const after = created!.entity_after as Record<string, unknown>;
    expect(after).toMatchObject({ provider: "orthoapnea", externalId: res.body.externalId, rulesVersion: RULES_VERSION });
    expect(after.dto).toEqual(dto);
    // The doctor's confirmation is part of the audited order.
    expect(after.order).toMatchObject({ acknowledgedWarnings: ["advanceUnder5"], registration: { method: "scanner", scannerTreatment: "MEDIT" } });
    // NEO-210 audit gate: the sender's role and client are part of the record.
    const raw = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ metadata: Record<string, unknown>; user_ip: string | null; user_agent: string | null }>(
        `SELECT metadata, user_ip, user_agent FROM audit_log WHERE id = $1`,
        [created!.id],
      ),
    );
    expect(raw.rows[0].metadata).toMatchObject({ actingUserRole: expect.any(String) });
    expect(raw.rows[0].user_ip).toBeTruthy();
    expect(raw.rows[0].user_agent).toBe("neo210-audit-test");
  });

  it("an order from an older client (no registration / acknowledgedWarnings) is audited with the defaults", async () => {
    const s = await setup();
    const { registration: _r, acknowledgedWarnings: _a, ...oldClientOrder } = validOrder(s.dentistId);
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: { ...oldClientOrder, notAField: "dropped" } });
    await trackLink(s.planId);
    expect(res.status).toBe(201);
    const audit = await withTenant(TENANT_SLUG, (client) => getAuditLogForEntities(client, ["PartnerOrder"], [s.planId]));
    const after = audit.find((e) => e.action === "create")!.entity_after as { order: Record<string, unknown> };
    expect(after.order).toMatchObject({ registration: { method: "impression" }, acknowledgedWarnings: [] });
    expect(after.order).not.toHaveProperty("notAField");
  });

  it("409 on a second submit of the same plan — still one OrthoApnea order", async () => {
    const s = await setup();
    const send = () =>
      request(app)
        .post("/api/v1/device-orders")
        .set("Authorization", `Bearer ${s.token}`)
        .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect((await send()).status).toBe(201);
    await trackLink(s.planId);
    const second = await send();
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("PARTNER_ORDER_ALREADY_SUBMITTED");
    expect(replica.count("POST", TREATMENTS)).toBe(1);
  });

  it("two concurrent submits for the same plan produce exactly ONE OrthoApnea order (and one OA patient)", async () => {
    const s = await setup();
    const send = () =>
      request(app)
        .post("/api/v1/device-orders")
        .set("Authorization", `Bearer ${s.token}`)
        .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });

    // Five at once: without the advisory lock in claimTreatmentSubmission this
    // let two or more through in most runs (checked by removing the lock).
    const results = await Promise.all([send(), send(), send(), send(), send()]);
    await trackLink(s.planId);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(replica.count("POST", TREATMENTS)).toBe(1);
    expect(replica.count("POST", "/api/patient")).toBe(1);
  });

  it("service level: ten simultaneous createOrthoApneaTreatment calls for one plan → one POST, nine ConflictErrors", async () => {
    const s = await setup();
    const oaPatient = await ensureOrthoApneaPatient(TENANT_SLUG, s.patientId);
    const dto = { patientId: Number(oaPatient), product: { id: 3, code: "002" }, deliveryAddress: {} };

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => createOrthoApneaTreatment(TENANT_SLUG, s.planId, dto)));
    await trackLink(s.planId);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(9);
    expect(rejected.every((r) => r.reason instanceof ConflictError)).toBe(true);
    expect(replica.count("POST", TREATMENTS)).toBe(1);
  });

  it("service level: a claim racing another claimer's uncommitted marker waits for it, then 409s — no OA call", async () => {
    // Deterministic version of the race: transaction T plays "the other
    // submit", holding its fresh 'pending' row uncommitted while this submit
    // claims. A check-then-insert claim would see no row and go on to POST.
    const s = await setup();
    let submit: Promise<unknown> = Promise.resolve();
    await withTenant(TENANT_SLUG, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO partner_link (partner, entity_type, entity_id, sync_status) VALUES ('orthoapnea', 'treatment_plan', $1, 'pending') RETURNING id`,
        [s.planId]
      );
      createdPartnerLinkIds.push(rows[0]!.id);
      submit = createOrthoApneaTreatment(TENANT_SLUG, s.planId, { patientId: 1 }).then(
        () => "sent",
        (err: unknown) => err
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    const outcome = await submit;
    expect(outcome).toBeInstanceOf(ConflictError);
    expect((outcome as ConflictError).code).toBe("PARTNER_ORDER_SUBMISSION_PENDING");
    expect(replica.count("POST", TREATMENTS)).toBe(0);
  });

  it("502 when OrthoApnea rejects the order; the link is 'failed' and a retry is allowed", async () => {
    const s = await setup();
    replica.failNext(TREATMENTS, 500);
    const send = () =>
      request(app)
        .post("/api/v1/device-orders")
        .set("Authorization", `Bearer ${s.token}`)
        .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });

    const first = await send();
    await trackLink(s.planId);
    expect(first.status).toBe(502);
    const failed = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    expect(failed?.sync_status).toBe("failed");

    const retry = await send();
    expect(retry.status).toBe(201);
    expect(replica.treatments.size).toBe(1);
  });

});

/**
 * Łukasz D3 (2026-10-03): a submit that finds a link left 'pending' for more
 * than RECONCILE_AFTER_MS first asks OrthoApnea whether the interrupted
 * submit reached it (GET /api/treatments/byPatient/{oaPatientId}).
 */
describe("POST /api/v1/device-orders — reconcile of an interrupted submit", () => {
  /** A 'pending' treatment_plan link as an interrupted submit leaves it, last touched `minutesAgo` minutes ago. */
  async function pendingLink(planId: string, minutesAgo: number): Promise<string> {
    const id = await withTenant(TENANT_SLUG, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO partner_link (partner, entity_type, entity_id, sync_status, created_at, updated_at)
         VALUES ('orthoapnea', 'treatment_plan', $1, 'pending', now() - make_interval(mins => $2), now() - make_interval(mins => $2))
         RETURNING id`,
        [planId, minutesAgo]
      );
      return rows[0]!.id;
    });
    createdPartnerLinkIds.push(id);
    return id;
  }

  /** The order the interrupted submit would have created: POSTed straight to the replica, as OA would have stored it. */
  async function orderAlreadyInOa(oaPatientId: string, productCode = "002"): Promise<number> {
    const res = await orthoApneaRawRequest(TREATMENTS, {
      method: "POST",
      body: orthoApneaTreatmentForm({ patientId: Number(oaPatientId), product: { id: 3, code: productCode }, deliveryAddress: {} }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { id: number }).id;
  }

  const reads = (oaPatientId: string) => replica.requests.filter((r) => r.method === "GET" && r.path === `${TREATMENTS}/byPatient/${oaPatientId}`).length;

  async function reconcileRows(linkId: string) {
    return withTenant(TENANT_SLUG, async (client) => {
      const { rows } = await client.query<{ action: string; success: boolean; response_payload: Record<string, unknown> | null; error_message: string | null }>(
        `SELECT action, success, response_payload, error_message FROM partner_transaction WHERE partner_link_id = $1 AND action = 'reconcile'`,
        [linkId]
      );
      return rows;
    });
  }

  function submit(s: Setup) {
    return request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
  }

  it("(a) stale pending + the order is in OA → link synced to it, 409 already submitted with its id, zero new orders", async () => {
    const s = await setup();
    const oaPatientId = await ensureOrthoApneaPatient(TENANT_SLUG, s.patientId);
    const linkId = await pendingLink(s.planId, RECONCILE_AFTER_MINUTES + 1);
    const externalId = await orderAlreadyInOa(oaPatientId);
    const postsBefore = replica.count("POST", TREATMENTS);

    const res = await submit(s);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "PARTNER_ORDER_ALREADY_SUBMITTED", externalId: String(externalId) });
    expect(replica.count("POST", TREATMENTS)).toBe(postsBefore);
    expect(reads(oaPatientId)).toBe(1);
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    expect(link).toMatchObject({ sync_status: "synced", external_id: String(externalId), external_status: "1" });
    const rows = await reconcileRows(linkId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ success: true, response_payload: { id: externalId, product: { code: "002" } } });
  });

  it("(b) stale pending + nothing in OA → link failed (reconcile not_found), then exactly one POST and 201", async () => {
    const s = await setup();
    const oaPatientId = await ensureOrthoApneaPatient(TENANT_SLUG, s.patientId);
    const linkId = await pendingLink(s.planId, RECONCILE_AFTER_MINUTES + 1);

    const res = await submit(s);

    expect(res.status).toBe(201);
    expect(replica.count("POST", TREATMENTS)).toBe(1);
    expect(reads(oaPatientId)).toBe(1);
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    expect(link).toMatchObject({ id: linkId, sync_status: "synced", external_id: res.body.externalId });
    expect(await reconcileRows(linkId)).toEqual([expect.objectContaining({ success: true, error_message: "not_found" })]);
  });

  it("(b') an order in OA for another product doesn't count — one new POST, 201", async () => {
    const s = await setup();
    const oaPatientId = await ensureOrthoApneaPatient(TENANT_SLUG, s.patientId);
    await pendingLink(s.planId, RECONCILE_AFTER_MINUTES + 1);
    await orderAlreadyInOa(oaPatientId, "003");
    const postsBefore = replica.count("POST", TREATMENTS);

    const res = await submit(s);
    expect(res.status).toBe(201);
    expect(replica.count("POST", TREATMENTS)).toBe(postsBefore + 1);
  });

  it("(b'') no OA patient was ever created → nothing to look for: no read, one POST, 201", async () => {
    const s = await setup();
    await pendingLink(s.planId, RECONCILE_AFTER_MINUTES + 1);
    const res = await submit(s);
    expect(res.status).toBe(201);
    expect(replica.requests.some((r) => r.path.startsWith(`${TREATMENTS}/byPatient/`))).toBe(false);
    expect(replica.count("POST", TREATMENTS)).toBe(1);
  });

  it("(c) a fresh pending link → 409 submission pending, zero reads, zero POSTs (a submit may still be running)", async () => {
    const s = await setup();
    await pendingLink(s.planId, 1);

    const res = await submit(s);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PARTNER_ORDER_SUBMISSION_PENDING");
    expect(replica.requests.some((r) => r.path.startsWith(`${TREATMENTS}/byPatient/`))).toBe(false);
    expect(replica.count("POST", TREATMENTS)).toBe(0);
    expect(replica.count("POST", "/api/patient")).toBe(0);
  });

  it("(d) OrthoApnea down during reconcile → the link stays pending, 409 submission pending, zero POSTs", async () => {
    const s = await setup();
    const oaPatientId = await ensureOrthoApneaPatient(TENANT_SLUG, s.patientId);
    const linkId = await pendingLink(s.planId, RECONCILE_AFTER_MINUTES + 1);
    replica.failNext(`${TREATMENTS}/byPatient/${oaPatientId}`, 503);

    const res = await submit(s);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PARTNER_ORDER_SUBMISSION_PENDING");
    expect(replica.count("POST", TREATMENTS)).toBe(0);
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    expect(link?.sync_status).toBe("pending");
    expect(await reconcileRows(linkId)).toEqual([expect.objectContaining({ success: false })]);
  });
});

describe("a doctor orders only as themselves, to their own clinic (NEO-210, 2026-10-03)", () => {
  it("context: a doctor sends no dentist_id and gets their own practitioner and clinic; another dentist_id is ignored", async () => {
    const s = await setup();
    const other = await setup({ ...COMPLETE_HCO, city: "Guadalajara" });
    const doctorToken = await doctorLoginFor(s);

    const own = await request(app).get("/api/v1/device-orders/context?product_code=002").set("Authorization", `Bearer ${doctorToken}`);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ dentistId: s.dentistId, delivery: { city: COMPLETE_HCO.city }, deliveryIssues: [] });

    const spoofed = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${other.dentistId}&product_code=002`)
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(spoofed.body).toMatchObject({ dentistId: s.dentistId, delivery: { city: COMPLETE_HCO.city } });
  });

  it("POST: a doctor ordering as another dentist → 403 and OrthoApnea receives nothing; as themselves → 201", async () => {
    const s = await setup();
    const other = await setup();
    const doctorToken = await doctorLoginFor(s);

    const forbidden = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(other.dentistId) });
    expect(forbidden.status).toBe(403);
    expect(replica.count("POST", TREATMENTS)).toBe(0);

    const ok = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(ok.status).toBe(201);
    await trackLink(s.planId);
  });

  it("context for a non-doctor still requires dentist_id", async () => {
    const s = await setup();
    const res = await request(app).get("/api/v1/device-orders/context?product_code=002").set("Authorization", `Bearer ${s.token}`);
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual([{ path: "dentist_id", code: "required" }]);
  });
});

describe("admin picks another of the doctor's clinics as the delivery address (NEO-210 D2, 2026-10-03)", () => {
  const TOLUCA = { ...COMPLETE_HCO, city: "Toluca", postal_code: "50000" };

  it("context: admin gets every clinic of the doctor (primary first) and the chosen one as delivery", async () => {
    const s = await setup();
    const tolucaId = await addClinic(s.dentistId, TOLUCA, "QA Toluca Clinic");

    const primary = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(primary.body.delivery).toMatchObject({ city: COMPLETE_HCO.city });
    expect(primary.body.deliveryOptions).toHaveLength(2);
    expect(primary.body.deliveryOptions[0]).toMatchObject({ isPrimary: true, city: COMPLETE_HCO.city });
    expect(primary.body.deliveryOptions[1]).toMatchObject({ organizationId: tolucaId, name: "QA Toluca Clinic", isPrimary: false, city: "Toluca" });

    const chosen = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002&organization_id=${tolucaId}`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(chosen.status).toBe(200);
    expect(chosen.body).toMatchObject({ delivery: { city: "Toluca", organizationId: tolucaId }, deliveryIssues: [] });
  });

  it("a clinic the doctor isn't affiliated with is an invalid choice, not a delivery address", async () => {
    const s = await setup();
    const stranger = await setup({ ...COMPLETE_HCO, city: "Monterrey" });
    const strangerClinic = await addClinic(stranger.dentistId);

    const res = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002&organization_id=${strangerClinic}`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(res.body).toMatchObject({ delivery: null, deliveryIssues: [{ path: "delivery_organization_id", code: "invalid" }] });
  });

  it("only an admin may choose: a manager gets 403, a doctor sees no list", async () => {
    const s = await setup(COMPLETE_HCO, "manager");
    const otherId = await addClinic(s.dentistId, TOLUCA);
    const managerRes = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002&organization_id=${otherId}`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(managerRes.status).toBe(403);

    const doctorToken = await doctorLoginFor(s);
    const doctorRes = await request(app).get("/api/v1/device-orders/context?product_code=002").set("Authorization", `Bearer ${doctorToken}`);
    expect(doctorRes.body.deliveryOptions).toBeUndefined();
    expect(doctorRes.body.delivery).toMatchObject({ city: COMPLETE_HCO.city });
  });

  it("POST: the order ships to the clinic the admin chose", async () => {
    const s = await setup();
    const tolucaId = await addClinic(s.dentistId, TOLUCA);
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, delivery_organization_id: tolucaId, order: validOrder(s.dentistId) });
    await trackLink(s.planId);

    expect(res.status).toBe(201);
    const dto = replica.requests.find((r) => r.method === "POST" && r.path === TREATMENTS)!.body as Record<string, unknown>;
    expect(dto.deliveryAddress).toMatchObject({ city: "Toluca", postalCode: "50000" });
  });

  it("POST: a doctor can't redirect the delivery — 403, OrthoApnea receives nothing", async () => {
    const s = await setup();
    const otherId = await addClinic(s.dentistId, TOLUCA);
    const doctorToken = await doctorLoginFor(s);
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, delivery_organization_id: otherId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(403);
    expect(replica.count("POST", TREATMENTS)).toBe(0);
  });
});

describe("GET /api/v1/device-orders/context", () => {
  it("returns the primary HCO as the delivery address, no issues, OA's minimum date and the rules version", async () => {
    const s = await setup();
    const res = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      delivery: {
        address: COMPLETE_HCO.address_line1,
        city: COMPLETE_HCO.city,
        postalCode: "06600",
        countryCode: "MX",
        organizationId: expect.any(String),
      },
      deliveryIssues: [],
      rulesVersion: RULES_VERSION,
    });
    expect(res.body.minDesiredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("delivery null + a 'required' issue when the dentist has no HCO; minDesiredDate null when OA is down", async () => {
    const s = await setup(null);
    replica.failNext("/api/products/manufacturingDate", 503);
    const res = await request(app)
      .get(`/api/v1/device-orders/context?dentist_id=${s.dentistId}&product_code=002`)
      .set("Authorization", `Bearer ${s.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ delivery: null, deliveryIssues: [{ path: "delivery", code: "required" }], minDesiredDate: null });
  });

  it("400 for a missing dentist_id or an unknown product code", async () => {
    const s = await setup();
    const res = await request(app).get("/api/v1/device-orders/context?product_code=999").set("Authorization", `Bearer ${s.token}`);
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual([
      { path: "dentist_id", code: "required" },
      { path: "product_code", code: "invalid" },
    ]);
  });
});

/** A staff identity's unread `device_order_placed` rows for this plan, by their users.id. */
async function userNotifications(userId: string, planId: string): Promise<string[]> {
  const { rows } = await withTenant(TENANT_SLUG, (client) =>
    client.query<{ type: string }>(
      `SELECT n.type FROM notification n JOIN users u ON u.identity_id = n.identity_id
        WHERE u.id = $1 AND n.entity_id = $2 AND n.type = 'device_order_placed' AND n.read_at IS NULL`,
      [userId, planId]
    )
  );
  return rows.map((r) => r.type);
}

/** A dentist's (practitioner's) unread `device_order_placed` rows for this plan. */
async function dentistNotifications(dentistId: string, planId: string): Promise<string[]> {
  const { rows } = await withTenant(TENANT_SLUG, (client) =>
    client.query<{ type: string }>(
      `SELECT n.type FROM notification n JOIN practitioner p ON p.identity_id = n.identity_id
        WHERE p.id = $1 AND n.entity_id = $2 AND n.type = 'device_order_placed' AND n.read_at IS NULL`,
      [dentistId, planId]
    )
  );
  return rows.map((r) => r.type);
}

describe("NEO-197: device_order_placed notification", () => {
  it("201: the dentist, an uninvolved admin and a manager each get exactly one unread item; the placer gets none; an unrelated dentist gets none", async () => {
    const s = await setup();
    const unrelated = await setup();
    const { otherAdminId, managerId } = await withTenant(TENANT_SLUG, async (client) => {
      const admin = await insertStaffUser(client, `qa-notify-admin-${uniqueSuffix()}@neosleepcare.com`, "QA", "Admin", "admin", null, false);
      const manager = await insertStaffUser(client, `qa-notify-manager-${uniqueSuffix()}@neosleepcare.com`, "QA", "Manager", "manager", null, false);
      return { otherAdminId: admin!.id, managerId: manager!.id };
    });

    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(201);
    await trackLink(s.planId);

    expect(await dentistNotifications(s.dentistId, s.planId)).toEqual(["device_order_placed"]);
    expect(await userNotifications(otherAdminId, s.planId)).toEqual(["device_order_placed"]);
    expect(await userNotifications(managerId, s.planId)).toEqual(["device_order_placed"]);
    // The admin who placed the order is the actor — notify() never notifies the actor about their own action.
    expect(await userNotifications(s.userId, s.planId)).toEqual([]);
    // A dentist unconnected to this order sees nothing.
    expect(await dentistNotifications(unrelated.dentistId, s.planId)).toEqual([]);
  });

  it("502 when OrthoApnea rejects the order: nobody is notified", async () => {
    const s = await setup();
    replica.failNext(TREATMENTS, 500);
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order: validOrder(s.dentistId) });
    expect(res.status).toBe(502);
    await trackLink(s.planId);

    expect(await dentistNotifications(s.dentistId, s.planId)).toEqual([]);
  });
});

describe("POST /api/v1/partners/orthoapnea/treatments (removed pass-through)", () => {
  it("410 Gone — an arbitrary body can never reach OrthoApnea", async () => {
    const s = await setup();
    const res = await request(app)
      .post("/api/v1/partners/orthoapnea/treatments")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, retrusionMax: -5, protrusionMax: 5 });
    expect(res.status).toBe(410);
    expect(replica.requests).toHaveLength(0);
  });
});
