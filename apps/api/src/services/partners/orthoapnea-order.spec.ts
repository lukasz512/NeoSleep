import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getAuditLogForEntities } from "../../db.js";
import { getNotificationsPaginated } from "../../db/notification.js";
import { getPartnerLink } from "../../db/partnerLink.js";
import type { TenantContext } from "../../context/TenantContext.js";
import { CreatePatientCommand } from "../../commands/patient.js";
import { CreatePractitionerCommand } from "../../commands/practitioner.js";
import { CreateSleepStudyCommand } from "../../commands/sleepStudy.js";
import { CreateTreatmentPlanCommand } from "../../commands/treatmentPlan.js";
import { getTreatmentPlanById } from "../../db/treatmentPlan.js";
import { SyncOrthoApneaTreatmentStatusesCommand } from "../../commands/orthoapneaSync.js";
import { PartnerServiceError, ConflictError } from "../../errors.js";
import {
  ensureOrthoApneaPatient,
  createOrthoApneaTreatment,
  addOrthoApneaComment,
  __resetOrthoApneaStateForTests,
} from "./orthoapnea.js";

// Loaded via fs rather than a static JSON import — avoids the composite
// TS project needing this fixture path added to its file list.
const treatmentDtoFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/orthoapnea/treatmentDto.json", import.meta.url)), "utf-8")
) as Record<string, unknown>;

/**
 * DB-touching order-submission paths — real Postgres ("test" tenant schema,
 * per CLAUDE.md's "No mock-only tests for the API server" rule), only the
 * OrthoApnea HTTP boundary (global fetch) is mocked. See orthoapnea.spec.ts
 * for the pure/login-only unit tests that don't need a DB at all.
 *
 * Each test does several sequential round-trips against a remote (Supabase)
 * DB — comfortably over vitest's 5s default here, same as other command-level
 * integration specs in this repo (see treatmentPlan.spec.ts).
 *
 * SHAPE OF THESE TESTS (post ADR-017): ensureOrthoApneaPatient/
 * createOrthoApneaTreatment/addOrthoApneaComment/SyncOrthoApneaTreatmentStatusesCommand
 * now take a tenant SLUG and manage their own short-lived transactions
 * internally, rather than a caller-provided PoolClient wrapping the whole
 * operation. That means local fixture setup (creating the patient/study/plan)
 * must happen in its OWN withTenant() call that actually COMMITS before the
 * service function runs — otherwise the service function's independent
 * connection can't see the uncommitted setup rows (READ COMMITTED isolation).
 * Assertions that read the resulting rows likewise use their own fresh
 * withTenant() call rather than reusing a client from setup.
 */
vi.setConfig({ testTimeout: 30_000 });

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fakeJwt(expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString(
    "base64url"
  );
  return `header.${payload}.signature`;
}

type RouteHandler = () => { status: number; body: unknown };

function stubFetchRoutes(routes: Record<string, RouteHandler>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const match = Object.entries(routes).find(([pattern]) => url.includes(pattern));
    if (!match) throw new Error(`Unmocked fetch call in test: ${url}`);
    const { status, body } = match[1]();
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

const LOGIN_ROUTE: [string, RouteHandler] = ["/api/login", () => ({ status: 200, body: { token: fakeJwt(1800) } })];

async function buildTestContext(client: Parameters<typeof CreatePatientCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-oa-order-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

/** One committed transaction that creates a QA user + patient, for tests that only need a bare patient. */
async function setupPatient(overrides: Partial<Parameters<typeof CreatePatientCommand>[1]> = {}) {
  return withTenant(TENANT_SLUG, async (client) => {
    const ctx = await buildTestContext(client);
    const patient = await CreatePatientCommand(ctx, {
      first_name: "Test",
      last_name: `Patient-${uniqueSuffix()}`,
      email: `qa-patient-${uniqueSuffix()}@example.com`,
      phone: "600100200",
      ...overrides,
    });
    return { ctx, patient };
  });
}

/** One committed transaction that creates a QA user + patient + sleep_study + treatment_plan. */
async function setupPatientAndPlan(planOverrides: Partial<Parameters<typeof CreateTreatmentPlanCommand>[1]> = {}) {
  return withTenant(TENANT_SLUG, async (client) => {
    const ctx = await buildTestContext(client);
    const patient = await CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}`, email: `qa-patient-${uniqueSuffix()}@example.com`, phone: "600100200" });
    const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
    const plan = await CreateTreatmentPlanCommand(ctx, {
      patient_id: patient.id,
      sleep_study_id: study.id,
      type: "dental_appliance",
      ...planOverrides,
    });
    return { ctx, patient, study, plan };
  });
}

/** Fresh short transaction for a one-off read — mirrors what the real service functions do post-ADR-017. */
async function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withTenant(TENANT_SLUG, async (client) => (await client.query<T>(sql, params)).rows);
}

/**
 * SyncOrthoApneaTreatmentStatusesCommand scans ALL non-terminal partner_link
 * rows for the tenant (by design — that's the real job). Left uncleaned,
 * every run's rows pile up and each subsequent run of the sync test gets
 * slower processing all of them (this actually happened while writing this
 * suite — a run went from ~5s to 30s+ as leftover rows from prior runs
 * accumulated). Tracking + deleting the rows THIS file creates keeps it fast
 * regardless of how many times the suite has run before. Test patients
 * themselves are deliberately left uncleaned, matching this repo's existing
 * convention (see treatmentPlan.spec.ts) — only partner_link is special
 * because of its "scan everything" access pattern.
 */
const createdPartnerLinkIds: string[] = [];

// orthoapnea.ts caches session/cooldown state at module scope (correct for a
// real process, one live session) — this file statically imports that module
// once for all its tests, so without a reset a login failure in one test
// (there are several by design — testing the failure paths) leaves later
// tests inside the 15s RECONNECT_COOLDOWN_MS window short-circuited with
// "connection recently failed — cooling down" instead of exercising their
// own mocked scenario. See __resetOrthoApneaStateForTests's own doc comment.
beforeEach(() => {
  __resetOrthoApneaStateForTests();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (createdPartnerLinkIds.length > 0) {
    const ids = createdPartnerLinkIds.splice(0, createdPartnerLinkIds.length);
    await withTenant(TENANT_SLUG, (client) => client.query("DELETE FROM partner_link WHERE id = ANY($1)", [ids]));
  }
});

describe("ensureOrthoApneaPatient", () => {
  it("creates a partner_link + partner_transaction on first call, and is idempotent after", async () => {
    const { patient } = await setupPatient();

    const { calls } = stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/countries": () => ({ status: 200, body: [{ id: 29, code: "MX" }] }),
      "/api/patient": () => ({ status: 200, body: { id: 99001 } }),
    });

    const externalId = await ensureOrthoApneaPatient(TENANT_SLUG, patient.id);
    expect(externalId).toBe("99001");

    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "patient", patient.id));
    expect(link?.sync_status).toBe("synced");
    expect(link?.external_id).toBe("99001");
    createdPartnerLinkIds.push(link!.id);

    const transactions = await query<{ action: string; success: boolean; response_payload: unknown }>(
      "SELECT action, success, request_payload, response_payload FROM partner_transaction WHERE partner_link_id = $1",
      [link!.id]
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.action).toBe("create_patient");
    expect(transactions[0]!.success).toBe(true);
    expect(transactions[0]!.response_payload).toEqual({ id: 99001 });

    const patientCallsBefore = calls.filter((u) => u.includes("/api/patient") && !u.includes("countries")).length;
    const secondCallExternalId = await ensureOrthoApneaPatient(TENANT_SLUG, patient.id);
    expect(secondCallExternalId).toBe("99001");
    const patientCallsAfter = calls.filter((u) => u.includes("/api/patient") && !u.includes("countries")).length;
    expect(patientCallsAfter).toBe(patientCallsBefore); // idempotent — no second POST /api/patient
  });

  it("sends the confirmed POST /api/patient payload shape (live-captured field set)", async () => {
    // region: "MX" so resolveCountryId() actually resolves a countryId —
    // otherwise it's correctly omitted (not sent as null/0), which would
    // make this specific "every confirmed field present" assertion moot.
    const { patient } = await setupPatient({ region: "MX" });

    stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/user/me": () => ({ status: 200, body: { id: 15682 } }),
      "/api/countries": () => ({ status: 200, body: [{ id: 29, code: "MX" }] }),
      "/api/patient": () => ({ status: 200, body: { id: 99002 } }),
    });

    await ensureOrthoApneaPatient(TENANT_SLUG, patient.id);
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "patient", patient.id));
    createdPartnerLinkIds.push(link!.id);

    const transactions = await query<{ request_payload: Record<string, unknown> }>(
      "SELECT request_payload FROM partner_transaction WHERE partner_link_id = $1",
      [link!.id]
    );
    const payload = transactions[0]!.request_payload;
    // Field set confirmed via live capture (PUT/POST /api/patient) — see
    // ensureOrthoApneaPatient's own comment for the source.
    expect(Object.keys(payload).sort()).toEqual(
      [
        "name", "email", "identityNumber", "insuranceNumber", "birthDate", "male", "phone",
        "countryId", "province", "city", "address", "postalCode", "userId", "profession",
      ].sort()
    );
    expect(payload.userId).toBe(15682);
    expect(payload.countryId).toBe(29);
  });
});

describe("createOrthoApneaTreatment", () => {
  it("records the request/response and marks partner_link synced with the returned statusId", async () => {
    const { plan } = await setupPatientAndPlan();

    stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/treatments": () => ({ status: 200, body: treatmentDtoFixture }),
    });

    const wizardPayload = { product: { id: 3 }, retrusionMax: -5, protrusionMax: 5 };
    const result = await createOrthoApneaTreatment(TENANT_SLUG, plan.id, wizardPayload);

    expect(result.externalId).toBe("452434");
    expect(result.externalStatus).toBe("1");

    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", plan.id));
    expect(link?.sync_status).toBe("synced");
    expect(link?.external_status).toBe("1");
    createdPartnerLinkIds.push(link!.id);

    const transactions = await query<{
      action: string;
      success: boolean;
      request_payload: Record<string, unknown>;
      validation_report: { missingFields: string[] };
    }>(
      "SELECT action, success, request_payload, validation_report FROM partner_transaction WHERE partner_link_id = $1",
      [link!.id]
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.action).toBe("create_treatment");
    expect(transactions[0]!.success).toBe(true);
    expect(transactions[0]!.request_payload).toEqual(wizardPayload);
    // create_treatment's expected-fields baseline is a deliberate subset — no REQUIRED field should be missing.
    expect(transactions[0]!.validation_report.missingFields).toEqual([]);
  });

  it("marks partner_link failed and logs a failed transaction when OrthoApnea returns an error status", async () => {
    const { plan } = await setupPatientAndPlan();

    stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/treatments": () => ({ status: 500, body: { error: "internal error" } }),
    });

    await expect(createOrthoApneaTreatment(TENANT_SLUG, plan.id, {})).rejects.toThrow(PartnerServiceError);

    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", plan.id));
    expect(link?.sync_status).toBe("failed");
    expect(link?.last_error).toContain("500");
    createdPartnerLinkIds.push(link!.id);

    const transactions = await query<{ success: boolean; http_status: number }>(
      "SELECT success, http_status FROM partner_transaction WHERE partner_link_id = $1",
      [link!.id]
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.success).toBe(false);
    expect(transactions[0]!.http_status).toBe(500);

    // A failed OrthoApnea submission must not touch the local record —
    // treatment_plan is the source of truth and survives partner outages.
    const localPlan = await withTenant(TENANT_SLUG, (client) => getTreatmentPlanById(client, plan.id));
    expect(localPlan).not.toBeNull();
    expect(localPlan?.status).toBe(plan.status);
  });

  it("marks partner_link failed (distinct from an HTTP error) when OrthoApnea is unreachable", async () => {
    const { plan } = await setupPatientAndPlan();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/login")) return { ok: true, status: 200, json: async () => ({ token: fakeJwt(1800) }) } as Response;
        if (url.includes("/api/treatments")) throw new Error("network down");
        throw new Error(`Unmocked fetch call in test: ${url}`);
      })
    );

    await expect(createOrthoApneaTreatment(TENANT_SLUG, plan.id, {})).rejects.toThrow("network down");

    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", plan.id));
    expect(link?.sync_status).toBe("failed");
    expect(link?.external_id).toBeNull();
    expect(link?.last_error).toContain("network down");
    createdPartnerLinkIds.push(link!.id);

    const transactions = await query<{
      success: boolean;
      http_status: number | null;
      response_payload: unknown;
      error_message: string;
    }>(
      "SELECT success, http_status, response_payload, error_message FROM partner_transaction WHERE partner_link_id = $1",
      [link!.id]
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.success).toBe(false);
    expect(transactions[0]!.http_status).toBeNull(); // never got an HTTP response at all — distinct from a 500
    expect(transactions[0]!.response_payload).toBeNull();
    expect(transactions[0]!.error_message).toContain("network down");
  });

  it("rejects a duplicate submission for a treatment_plan already synced to OrthoApnea", async () => {
    const { plan } = await setupPatientAndPlan();

    const { calls } = stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/treatments": () => ({ status: 200, body: treatmentDtoFixture }),
    });

    const first = await createOrthoApneaTreatment(TENANT_SLUG, plan.id, {});
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", plan.id));
    createdPartnerLinkIds.push(link!.id);

    const treatmentCallsBefore = calls.filter((u) => u.includes("/api/treatments")).length;
    await expect(createOrthoApneaTreatment(TENANT_SLUG, plan.id, {})).rejects.toThrow(ConflictError);
    const treatmentCallsAfter = calls.filter((u) => u.includes("/api/treatments")).length;

    // The whole point of the guard: a double-click/resubmit must NOT place
    // a second real order with OrthoApnea (this is a billing-adjacent
    // partner account).
    expect(treatmentCallsAfter).toBe(treatmentCallsBefore);
    expect(first.externalId).toBe("452434");

    const transactions = await query<{ action: string }>(
      "SELECT action FROM partner_transaction WHERE partner_link_id = $1",
      [link!.id]
    );
    expect(transactions).toHaveLength(1); // still just the one successful create — the rejected duplicate never reached the API/log
  });

  // Two full patient+study+plan setups plus network round-trips against a
  // remote (Supabase) DB routinely exceed vitest's 5s default here.
  it("serializes concurrent mutating calls instead of racing them", async () => {
    const { plan: planA } = await setupPatientAndPlan();
    const { plan: planB } = await setupPatientAndPlan();

    let inFlight = 0;
    let overlapDetected = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/login")) return { ok: true, status: 200, json: async () => ({ token: fakeJwt(1800) }) } as Response;
        if (url.includes("/api/treatments")) {
          inFlight += 1;
          if (inFlight > 1) overlapDetected = true;
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight -= 1;
          return { ok: true, status: 200, json: async () => ({ ...treatmentDtoFixture, id: Math.floor(Math.random() * 1e6) }) } as Response;
        }
        throw new Error(`Unmocked fetch call in test: ${url}`);
      })
    );

    await Promise.all([
      createOrthoApneaTreatment(TENANT_SLUG, planA.id, {}),
      createOrthoApneaTreatment(TENANT_SLUG, planB.id, {}),
    ]);

    expect(overlapDetected).toBe(false);

    const [linkA, linkB] = await withTenant(TENANT_SLUG, (client) =>
      Promise.all([
        getPartnerLink(client, "orthoapnea", "treatment_plan", planA.id),
        getPartnerLink(client, "orthoapnea", "treatment_plan", planB.id),
      ])
    );
    createdPartnerLinkIds.push(linkA!.id, linkB!.id);
  });
});

describe("SyncOrthoApneaTreatmentStatusesCommand", () => {
  // Patient + practitioner + sleep_study + treatment_plan setup, plus two
  // create/sync round-trips against a remote (Supabase) DB — see the timeout
  // note on the concurrency test above for why this needs more than 5s.
  it("notifies the patient and dentist and writes an audit_log entry when the partner status changes", async () => {
    const { ctx, patient, plan, dentist } = await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}`, email: `qa-patient-${uniqueSuffix()}@example.com`, phone: "600100200" });
      const dentist = await CreatePractitionerCommand(ctx, {
        first_name: "Test",
        last_name: `Dentist-${uniqueSuffix()}`,
        email: `qa-dentist-${uniqueSuffix()}@example.com`,
        phone: "600100200",
      });
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
      const plan = await CreateTreatmentPlanCommand(ctx, {
        patient_id: patient.id,
        sleep_study_id: study.id,
        type: "dental_appliance",
        dentist_id: dentist.id,
      });
      return { ctx, patient, dentist, plan };
    });

    stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/treatments": () => ({ status: 200, body: treatmentDtoFixture }), // statusId 1
    });
    await createOrthoApneaTreatment(TENANT_SLUG, plan.id, {});

    stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/treatments/DTO": () => ({ status: 200, body: { ...treatmentDtoFixture, statusId: 2 } }),
    });

    // NOTE: the "test" schema accumulates treatment_plan/partner_link rows
    // across runs (nothing sweeps them — only qa-% *identities* get swept,
    // and these test patients have no email), so other pre-existing links
    // may also get (correctly) polled and marked changed here. Only this
    // test's own plan/link is asserted on below — the aggregate count just
    // needs to include ours.
    const result = await SyncOrthoApneaTreatmentStatusesCommand(TENANT_SLUG, ctx.requestId);
    expect(result.changed).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", plan.id));
    expect(link?.external_status).toBe("2");
    createdPartnerLinkIds.push(link!.id);

    const patientNotifications = await withTenant(TENANT_SLUG, (client) =>
      getNotificationsPaginated(client, patient.identity_id, "all", 1, 10)
    );
    expect(patientNotifications.rows.some((n) => n.type === "partner_order_status_changed")).toBe(true);

    const dentistNotifications = await withTenant(TENANT_SLUG, (client) =>
      getNotificationsPaginated(client, dentist.identity_id, "all", 1, 10)
    );
    expect(dentistNotifications.rows.some((n) => n.type === "partner_order_status_changed")).toBe(true);

    const auditEntries = await withTenant(TENANT_SLUG, (client) => getAuditLogForEntities(client, ["PartnerOrder"], [plan.id]));
    expect(auditEntries.some((e) => e.action === "status_change")).toBe(true);

    // Running again with the same (now-current) status should not double-notify.
    const secondResult = await SyncOrthoApneaTreatmentStatusesCommand(TENANT_SLUG, ctx.requestId);
    expect(secondResult.changed).toBe(0);
  });
});

describe("addOrthoApneaComment", () => {
  it("rejects commenting on a treatment_plan never submitted to OrthoApnea", async () => {
    const { plan } = await setupPatientAndPlan();

    await expect(addOrthoApneaComment(TENANT_SLUG, plan.id, "hello")).rejects.toThrow(PartnerServiceError);
  });

  it("posts the confirmed request shape and records the real emailed:true side effect", async () => {
    const { plan } = await setupPatientAndPlan();

    stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/treatments": () => ({ status: 200, body: treatmentDtoFixture }),
    });
    await createOrthoApneaTreatment(TENANT_SLUG, plan.id, {});
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", plan.id));
    createdPartnerLinkIds.push(link!.id);

    stubFetchRoutes({
      [LOGIN_ROUTE[0]]: LOGIN_ROUTE[1],
      "/api/user/me": () => ({ status: 200, body: { id: 15682 } }),
      "/api/notifications": () => ({
        status: 200,
        body: {
          id: 591960,
          action: "MESSAGE",
          type: "MESSAGE_DOCTOR_TO_TECHNICAL",
          note: "test comment",
          receiverRole: "ROLE_TECHNICAL",
          creationDate: "2026-09-07T01:33:49.174",
          treatmentId: Number(link!.external_id),
          emailed: true,
        },
      }),
    });

    const result = await addOrthoApneaComment(TENANT_SLUG, plan.id, "test comment");
    expect(result).toEqual({ notificationId: "591960", emailed: true });

    const transactions = await query<{
      action: string;
      request_payload: Record<string, unknown>;
      response_payload: { emailed: boolean };
      success: boolean;
    }>(
      "SELECT action, request_payload, response_payload, success FROM partner_transaction WHERE partner_link_id = $1 AND action = 'add_comment'",
      [link!.id]
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.success).toBe(true);
    // Confirmed verbatim field set from the live capture.
    expect(transactions[0]!.request_payload).toMatchObject({
      userSenderId: 15682,
      action: "MESSAGE",
      type: "MESSAGE_DOCTOR_TO_TECHNICAL",
      note: "test comment",
      receiverRole: "ROLE_TECHNICAL",
      treatmentId: Number(link!.external_id),
      files: false,
    });
    expect(transactions[0]!.response_payload.emailed).toBe(true);
  });
});
