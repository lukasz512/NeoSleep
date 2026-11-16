import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { withTenant } from "../../src/db.js";
import { getPartnerLink } from "../../src/db/partnerLink.js";
import {
  __resetOrthoApneaStateForTests,
  __setOrthoApneaBaseUrlForTests,
  oaModelStamp,
  orderUploadTimeoutMs,
  orthoApneaTreatmentForm,
} from "../../src/services/partners/orthoapnea.js";
import { isOwnScanFilePath, newScanFilePath, scanFilePrefix } from "../../src/services/deviceOrders/scanFiles.js";
import { startOaReplica, type OaReplica } from "../oa-replica/server.js";
import { setup, TENANT_SLUG, validOrder } from "./fixtures.js";

/**
 * Scan files on a device order (NEO-262): the browser uploads to private
 * storage through a signed URL, the order carries the paths, and the API sends
 * the bytes to OrthoApnea as MODEL parts. Postgres and the OA replica are
 * real; only Supabase Storage (an external service, not our DB) is stubbed.
 */
vi.setConfig({ testTimeout: 30_000 });

const stored = vi.hoisted(() => new Map<string, Uint8Array<ArrayBuffer>>());
vi.mock("../../src/services/partnerDocuments.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/partnerDocuments.js")>();
  return {
    ...actual,
    createPartnerDocumentUploadUrl: vi.fn(async (path: string) => ({ path, signedUrl: `https://storage.test/upload/${path}?token=t` })),
    downloadPartnerDocument: vi.fn(async (path: string) => {
      const bytes = stored.get(path);
      if (!bytes) throw new Error(`not in storage: ${path}`);
      return bytes;
    }),
  };
});

const TREATMENTS = "/api/treatments";
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
  stored.clear();
});

const planIds: string[] = [];
afterEach(async () => {
  const ids = planIds.splice(0, planIds.length);
  await withTenant(TENANT_SLUG, async (client) => {
    for (const planId of ids) {
      const link = await getPartnerLink(client, "orthoapnea", "treatment_plan", planId);
      if (link) await client.query("DELETE FROM partner_link WHERE id = $1", [link.id]);
    }
  });
});

function put(path: string, text: string): void {
  stored.set(path, new Uint8Array(Buffer.from(text)));
}

describe("scan file paths", () => {
  it("issues a path under the tenant + patient, keeps the name readable and two uploads apart", () => {
    const a = newScanFilePath("acme", "p1", "upper jaw.STL");
    const b = newScanFilePath("acme", "p1", "upper jaw.STL");
    expect(a.startsWith(scanFilePrefix("acme", "p1"))).toBe(true);
    expect(a).toMatch(/-upper_jaw\.STL$/);
    expect(a).not.toBe(b);
    expect(newScanFilePath("acme", "p1", "../../x.stl").slice(scanFilePrefix("acme", "p1").length)).not.toContain("/");
  });

  it("accepts only its own paths: other patient, other tenant, traversal and nesting are foreign", () => {
    const own = newScanFilePath("acme", "p1", "u.stl");
    expect(isOwnScanFilePath(own, "acme", "p1")).toBe(true);
    expect(isOwnScanFilePath(own, "acme", "p2")).toBe(false);
    expect(isOwnScanFilePath(own, "other", "p1")).toBe(false);
    expect(isOwnScanFilePath(`${scanFilePrefix("acme", "p1")}../p2/scans/x.stl`, "acme", "p1")).toBe(false);
    expect(isOwnScanFilePath(`${scanFilePrefix("acme", "p1")}a/b.stl`, "acme", "p1")).toBe(false);
    expect(isOwnScanFilePath(scanFilePrefix("acme", "p1"), "acme", "p1")).toBe(false);
  });
});

describe("OA multipart with model files", () => {
  it("stamps like OA's portal: DD-MM-YY h:mm, 12-hour, Madrid time, trailing space", () => {
    // 13:05 UTC in November = 14:05 in Madrid → "2:05".
    expect(oaModelStamp(new Date("2026-11-10T13:05:00Z"))).toBe("10-11-26 2:05 ");
    // Midnight in Madrid reads 12, like moment's "h".
    expect(oaModelStamp(new Date("2026-11-09T23:07:00Z"))).toBe("10-11-26 12:07 ");
  });

  it("puts one `file` part per scan, named stamp+name/modelstamp+name/4, before treatmentDTO", () => {
    const now = new Date("2026-11-10T13:05:00Z");
    const form = orthoApneaTreatmentForm({ a: 1 }, [{ name: "upper.stl", bytes: new Uint8Array([1, 2, 3]) }], now);
    const entries = [...form.entries()];
    expect(entries.map(([k]) => k)).toEqual(["file", "treatmentDTO"]);
    const file = entries[0]![1] as File;
    expect(file.name).toBe("10-11-26 2:05 upper.stl/model10-11-26 2:05 upper.stl/4");
    expect(file.size).toBe(3);
  });

  it("without scans the body is unchanged: treatmentDTO only", () => {
    expect([...orthoApneaTreatmentForm({ a: 1 }).keys()]).toEqual(["treatmentDTO"]);
  });

  it("gives a big upload more time: +1 s per started MB", () => {
    const base = orderUploadTimeoutMs([]);
    expect(orderUploadTimeoutMs([{ name: "x", bytes: new Uint8Array(30_000_000) }])).toBe(base + 30_000);
  });
});

describe("POST /api/v1/device-orders/scan-uploads", () => {
  it("201 with a signed upload URL for a path under this tenant and patient", async () => {
    const s = await setup();
    const res = await request(app)
      .post("/api/v1/device-orders/scan-uploads")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ patient_id: s.patientId, file_name: "upper.stl", size: 1234 });
    expect(res.status).toBe(201);
    expect(isOwnScanFilePath(res.body.path, TENANT_SLUG, s.patientId)).toBe(true);
    expect(res.body.uploadUrl).toContain(res.body.path);
  });

  it("400 for a wrong type, an empty or too large file, or a missing patient — no URL issued", async () => {
    const s = await setup();
    const ask = (body: object) => request(app).post("/api/v1/device-orders/scan-uploads").set("Authorization", `Bearer ${s.token}`).send(body);
    expect((await ask({ patient_id: s.patientId, file_name: "scan.exe", size: 10 })).body.fields).toEqual([{ path: "file", code: "scanFileType" }]);
    expect((await ask({ patient_id: s.patientId, file_name: "scan.stl", size: 0 })).body.fields).toEqual([{ path: "file", code: "scanFileEmpty" }]);
    expect((await ask({ patient_id: s.patientId, file_name: "scan.stl", size: 60 * 1024 * 1024 })).body.fields).toEqual([
      { path: "file", code: "scanFileTooLarge" },
    ]);
    const noPatient = await ask({ file_name: "scan.stl", size: 10 });
    expect(noPatient.status).toBe(400);
    expect(noPatient.body.fields).toEqual([{ path: "patient_id", code: "required" }]);
  });

  it("401 without a token", async () => {
    expect((await request(app).post("/api/v1/device-orders/scan-uploads").send({})).status).toBe(401);
  });
});

describe("POST /api/v1/device-orders with uploaded scans", () => {
  it("201: each scan reaches OA as a MODEL file part with its bytes, then the DTO without scanner fields", async () => {
    const s = await setup();
    const upper = newScanFilePath(TENANT_SLUG, s.patientId, "upper.stl");
    const lower = newScanFilePath(TENANT_SLUG, s.patientId, "lower.stl");
    put(upper, "solid upper");
    put(lower, "solid lower!");
    const order = validOrder(s.dentistId, {
      registration: {
        method: "files",
        files: [
          { path: upper, name: "upper.stl", size: 11 },
          { path: lower, name: "lower.stl", size: 12 },
        ],
      },
    });
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order });
    planIds.push(s.planId);

    expect(res.status).toBe(201);
    const posts = replica.requests.filter((r) => r.method === "POST" && r.path === TREATMENTS);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.fields).toEqual(["file", "file", "treatmentDTO"]);
    expect(posts[0]!.files.map((f) => f.text)).toEqual(["solid upper", "solid lower!"]);
    expect(posts[0]!.files[0]!.name).toMatch(/^\d\d-\d\d-\d\d \d{1,2}:\d\d upper\.stl\/model\d\d-\d\d-\d\d \d{1,2}:\d\d upper\.stl\/4$/);
    expect(posts[0]!.body).toMatchObject({ scannerTreatment: null, scannerPlatform: null });
  });

  it("400 for a path this API didn't issue for this patient — OA receives nothing", async () => {
    const s = await setup();
    const foreign = newScanFilePath(TENANT_SLUG, crypto.randomUUID(), "upper.stl");
    put(foreign, "someone else's scan");
    const order = validOrder(s.dentistId, { registration: { method: "files", files: [{ path: foreign, name: "upper.stl", size: 19 }] } });
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual([{ path: "registration.files.0", code: "invalid" }]);
    expect(replica.requests).toHaveLength(0);
  });

  it("400 files required when 'files' is chosen with no file — OA receives no order", async () => {
    const s = await setup();
    const order = validOrder(s.dentistId, { registration: { method: "files", files: [] } });
    const res = await request(app)
      .post("/api/v1/device-orders")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ treatment_plan_id: s.planId, patient_id: s.patientId, order });
    expect(res.status).toBe(400);
    expect(res.body.fields).toContainEqual({ path: "registration.files", code: "required" });
    expect(replica.requests.filter((r) => r.path === TREATMENTS)).toHaveLength(0);
  });

  it("a scan missing from storage fails the submit before OA gets an order; the link allows a retry", async () => {
    const s = await setup();
    const upper = newScanFilePath(TENANT_SLUG, s.patientId, "upper.stl");
    const order = validOrder(s.dentistId, { registration: { method: "files", files: [{ path: upper, name: "upper.stl", size: 11 }] } });
    const send = () =>
      request(app).post("/api/v1/device-orders").set("Authorization", `Bearer ${s.token}`).send({ treatment_plan_id: s.planId, patient_id: s.patientId, order });

    const first = await send();
    planIds.push(s.planId);
    expect(first.status).toBeGreaterThanOrEqual(500);
    expect(replica.requests.filter((r) => r.path === TREATMENTS)).toHaveLength(0);
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", s.planId));
    expect(link?.sync_status).toBe("failed");

    put(upper, "solid upper");
    const retry = await send();
    expect(retry.status).toBe(201);
    expect(replica.treatments.size).toBe(1);
  });
});
