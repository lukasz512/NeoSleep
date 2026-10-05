import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { withTenant } from "../../src/db.js";
import { getPartnerLink } from "../../src/db/partnerLink.js";
import {
  __resetOrthoApneaStateForTests,
  __setOrthoApneaBaseUrlForTests,
  ensureOrthoApneaPatient,
  fetchCountries,
  fetchOrthoApneaClinics,
  fetchOrthoApneaCurrentUser,
  fetchOrthoApneaManufacturingDate,
  findOrthoApneaProduct,
} from "../../src/services/partners/orthoapnea.js";
import { startOaReplica, type OaReplica } from "../oa-replica/server.js";
import { COMPLETE_HCO, setup, TENANT_SLUG, validOrder, type Setup } from "./fixtures.js";

/**
 * NEO-210 coverage gaps for the OrthoApnea order integration — real Postgres
 * ("test" tenant schema) + the in-process OA replica, same discipline as
 * deviceOrders.spec.ts. Nothing here ever calls the real OrthoApnea (the
 * fetch guard in test/fetch-guard.ts would reject any apneadock.es call
 * outright).
 *
 * Covers, specifically:
 *  1. Audit reconstruction release gate — can audit_log + request_log +
 *     partner_transaction alone reconstruct the sent JSON, the acting user,
 *     and the timestamp?
 *  2. The ambiguous-timeout path (orthoapnea.ts ~1441/1455): the link must
 *     stay 'pending' (not 'failed') and a same-window retry must not reach
 *     OrthoApnea a second time.
 *  3. A true network failure (not an HTTP error, not a timeout) reaching
 *     OrthoApnea AFTER a session is already established.
 *  4. PHI discipline: no patient name/email ever reaches console output.
 *
 * Duplicate-submit / concurrent-submit and the plain 5xx "lab rejects the
 * order" path are already covered by deviceOrders.spec.ts ("409 on a second
 * submit…", "two concurrent submits…", "502 when OrthoApnea rejects the
 * order…") — not repeated here.
 */
vi.setConfig({ testTimeout: 35_000 });

const TREATMENTS = "/api/treatments";
/**
 * orthoapnea.ts's FETCH_TIMEOUT_MS is a private, unexported module constant
 * (currently 20_000ms) with no test seam to shrink it — so the timeout test
 * below pays the real wall-clock cost rather than mock it away. Keep this in
 * sync if that constant ever changes; a mismatch only makes the timeout test
 * slower or (if set lower than the real value) flaky, never silently wrong.
 */
const KNOWN_FETCH_TIMEOUT_MS = 20_000;
/** An address nothing listens on — a fast, deterministic ECONNREFUSED, no DNS lookup. */
const UNREACHABLE_URL = "http://127.0.0.1:1";

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
  __setOrthoApneaBaseUrlForTests(replica.url); // undo any test that pointed elsewhere
  if (createdPartnerLinkIds.length > 0) {
    const ids = createdPartnerLinkIds.splice(0, createdPartnerLinkIds.length);
    await withTenant(TENANT_SLUG, (client) => client.query("DELETE FROM partner_link WHERE id = ANY($1)", [ids]));
  }
});

async function trackLink(planId: string): Promise<void> {
  const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", planId));
  if (link) createdPartnerLinkIds.push(link.id);
}

function submit(s: Setup, order = validOrder(s.dentistId)) {
  return request(app)
    .post("/api/v1/device-orders")
    .set("Authorization", `Bearer ${s.token}`)
    .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order });
}

/**
 * Warms every OA-side cache (session, clinics, products, countries, current
 * user, manufacturing date) and the patient link BEFORE the real assertion
 * runs, so the one real network call left during the timed/broken part of a
 * test is exactly the treatment-create POST — not an incidental login or
 * catalog GET racing for the same "next request" slot.
 */
async function prewarmOaCallGraph(s: Setup, productCode = "002"): Promise<void> {
  await ensureOrthoApneaPatient(TENANT_SLUG, s.patientId, { fallbackCountryCode: "MX" });
  await Promise.all([fetchOrthoApneaClinics(), fetchOrthoApneaCurrentUser(), fetchCountries()]);
  const product = await findOrthoApneaProduct(productCode);
  if (product) await fetchOrthoApneaManufacturingDate(product.id);
}

describe("audit reconstruction release gate (NEO-210)", () => {
  it("audit_log + partner_transaction reconstruct the exact sent JSON, the acting user id + role, client and timestamp; request_log contributes nothing", async () => {
    const s = await setup();
    const res = await submit(s);
    expect(res.status).toBe(201);
    await trackLink(s.planId);

    const sentDto = replica.requests.find((r) => r.method === "POST" && r.path === TREATMENTS)!.body as Record<string, unknown>;

    const { auditRows, requestLogCount, link, transactions } = await withTenant(TENANT_SLUG, async (client) => {
      const audit = await client.query(
        `SELECT * FROM audit_log WHERE entity_type = 'PartnerOrder' AND entity_id = $1 AND action = 'create'`,
        [s.planId]
      );
      const requestLog = await client.query(`SELECT count(*)::int AS n FROM request_log`);
      const linkRow = await getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId);
      const tx = await client.query(
        `SELECT * FROM partner_transaction WHERE partner_link_id = $1 AND action = 'create_treatment'`,
        [linkRow!.id]
      );
      return { auditRows: audit.rows, requestLogCount: requestLog.rows[0].n as number, link: linkRow!, transactions: tx.rows };
    });

    // --- What IS reconstructable from audit_log alone ---------------------
    expect(auditRows).toHaveLength(1);
    const auditRow = auditRows[0] as Record<string, unknown>;
    // The exact JSON sent to the lab.
    expect((auditRow.entity_after as Record<string, unknown>).dto).toEqual(sentDto);
    // The acting user's id (two independent columns: user_id and metadata.actingUserId).
    expect(auditRow.user_id).toBe(s.userId);
    expect((auditRow.metadata as Record<string, unknown>).actingUserId).toBe(s.userId);
    // A timestamp.
    expect(auditRow.created_at).toBeInstanceOf(Date);
    expect(Date.now() - (auditRow.created_at as Date).getTime()).toBeLessThan(60_000);

    // --- Corroboration from partner_transaction (only reachable via
    // partner_link, which is NOT one of the three named tables — see finding
    // below) matches the same JSON, independently captured. --------------
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.request_payload).toEqual(sentDto);
    expect(transactions[0]!.success).toBe(true);

    // --- FINDING 1: request_log is dead code. Nothing in apps/api/src ever
    // inserts into it (confirmed by code search) — it exists in every
    // tenant schema migration but contributes zero rows to any
    // reconstruction, release gate or otherwise.
    expect(requestLogCount).toBe(0);

    // --- FINDING 2: partner_transaction has no entity-level foreign key —
    // only partner_link_id. Joining it back to "this order" requires reading
    // partner_link, a FOURTH table outside the audit_log/request_log/
    // partner_transaction set the release gate is specified against. Without
    // partner_link, partner_transaction's rows cannot be attributed to any
    // treatment_plan/patient at all.
    expect(link.entity_id).toBe(s.planId); // the only place this link exists
    expect(transactions[0]).not.toHaveProperty("entity_id");

    // --- Fixed in NEO-210 (were findings 3 + 4): the acting user's role and
    // client are now on the audit row, so "who did this, as what role, from
    // where" is reconstructable from audit_log alone.
    expect(auditRow.metadata).toMatchObject({ actingUserRole: expect.any(String) });
    expect(auditRow.user_ip).toBeTruthy();
  });
});

describe("ambiguous timeout (orthoapnea.ts ~1441/1455, CORE-95 D3)", () => {
  it("a create_treatment call that times out keeps the link 'pending' (not 'failed'), surfaces 502, and blocks an immediate silent retry", async () => {
    const s = await setup();
    await prewarmOaCallGraph(s);
    const postsBefore = replica.count("POST", TREATMENTS);

    replica.delayNext(KNOWN_FETCH_TIMEOUT_MS + 2_000);
    const res = await submit(s);

    // The client sees a clear, surfaced error — not a silent hang, not a 2xx.
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("PARTNER_SERVICE_ERROR");
    await trackLink(s.planId);

    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    // THE key assertion: ambiguous outcome → stays 'pending', never 'failed' —
    // OrthoApnea may have actually created the order server-side (it did:
    // the replica kept processing after the client's AbortController fired).
    expect(link?.sync_status).toBe("pending");
    expect(link?.last_error).toContain("may have created the order");

    const transactions = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ success: boolean; error_message: string }>(
        `SELECT success, error_message FROM partner_transaction WHERE partner_link_id = $1 AND action = 'create_treatment'`,
        [link!.id]
      )
    );
    expect(transactions.rows).toHaveLength(1);
    expect(transactions.rows[0]!.success).toBe(false);
    expect(transactions.rows[0]!.error_message).toContain("timed out");

    // OrthoApnea's own side DID receive and store the order — this is exactly
    // what makes the outcome ambiguous for us.
    expect(replica.count("POST", TREATMENTS)).toBe(postsBefore + 1);

    // An immediate retry (same window, well under RECONCILE_AFTER_MS) must
    // NOT reach OrthoApnea again — it gets a clear 409, not a second order.
    const retry = await submit(s);
    expect(retry.status).toBe(409);
    expect(retry.body.code).toBe("PARTNER_ORDER_SUBMISSION_PENDING");
    expect(replica.count("POST", TREATMENTS)).toBe(postsBefore + 1); // still just the one (ambiguous) order
  });
});

describe("lab fully unreachable after a session is already established", () => {
  it("a refused connection is a 502 PARTNER_SERVICE_ERROR like any lab failure, and leaves no misleading 'sent' state", async () => {
    const s = await setup();
    await prewarmOaCallGraph(s); // establishes + caches a valid session against the replica

    __setOrthoApneaBaseUrlForTests(UNREACHABLE_URL); // session stays valid; only the NEXT fetch call breaks
    let res: Awaited<ReturnType<typeof submit>>;
    try {
      res = await submit(s);
    } finally {
      __setOrthoApneaBaseUrlForTests(replica.url);
    }
    await trackLink(s.planId);

    // NEO-210: the connection never opened, so the lab never saw the request —
    // same 502 as an HTTP-level lab failure, not a generic 500.
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("PARTNER_SERVICE_ERROR");

    // What correctness actually requires DOES hold: no row is left looking
    // "sent" — the link is unambiguously 'failed' (this was a hard failure,
    // not an ambiguous one), and a retry is allowed once the lab is back.
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    expect(link?.sync_status).toBe("failed");
    expect(link?.external_id).toBeNull();

    const tx = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ success: boolean; http_status: number | null; error_message: string | null }>(
        `SELECT success, http_status, error_message FROM partner_transaction WHERE partner_link_id = $1 AND action = 'create_treatment'`,
        [link!.id]
      )
    );
    expect(tx.rows).toHaveLength(1);
    expect(tx.rows[0]!.success).toBe(false);
    expect(tx.rows[0]!.http_status).toBeNull(); // never got an HTTP response at all
    expect(tx.rows[0]!.error_message).toBeTruthy();
  });
});

describe("PHI discipline in console output", () => {
  it("submit + status sync for a distinctively-named patient never logs the patient's name or email", async () => {
    const PATIENT_FIRST = "Zzpatient";
    const PATIENT_LAST = "Testname";
    const PATIENT_EMAIL = "zzpatient.testname@example.com";
    const s = await setup(COMPLETE_HCO, "admin", { first_name: PATIENT_FIRST, last_name: PATIENT_LAST, email: PATIENT_EMAIL });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const res = await submit(s);
      expect(res.status).toBe(201);
      await trackLink(s.planId);

      // Also exercise the status-sync path (a second surface that reads/writes partner_link + notifies).
      const { SyncOrthoApneaTreatmentStatusesCommand } = await import("../../src/commands/orthoapneaSync.js");
      await SyncOrthoApneaTreatmentStatusesCommand(TENANT_SLUG, `test-${Date.now()}`, "manual");
    } finally {
      const allCalls = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls];
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();

      const serialized = allCalls
        .map((args) =>
          args
            .map((a) => {
              try {
                return typeof a === "string" ? a : JSON.stringify(a);
              } catch {
                return String(a);
              }
            })
            .join(" ")
        )
        .join("\n");

      expect(serialized).not.toContain(PATIENT_FIRST);
      expect(serialized).not.toContain(PATIENT_LAST);
      expect(serialized).not.toContain(PATIENT_EMAIL);
    }
  });
});
