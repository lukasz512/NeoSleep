import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Loaded via fs rather than a static JSON import — avoids the composite
// TS project needing this fixture path added to its file list.
const treatmentDtoFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/orthoapnea/treatmentDto.json", import.meta.url)), "utf-8")
) as Record<string, unknown>;

/**
 * Pure/login-only unit tests — no DB involved (see orthoapnea-order.spec.ts
 * for the DB-touching order-submission paths, which run against the real
 * "test" tenant schema per CLAUDE.md's "No mock-only tests for the API
 * server" rule). Only the OrthoApnea HTTP boundary (global fetch) is mocked
 * here, same pattern as geocoding.spec.ts / googleCalendar.spec.ts.
 */
async function importService(configured: boolean) {
  vi.doMock("../../env.js", () => ({
    ORTHOAPNEA_BASE_URL: "https://apneadock.test",
    ORTHOAPNEA_EMAIL: configured ? "rep@example.com" : undefined,
    ORTHOAPNEA_PASSWORD: configured ? "secret" : undefined,
  }));
  vi.resetModules();
  return import("./orthoapnea.js");
}

function fakeJwt(expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString(
    "base64url"
  );
  return `header.${payload}.signature`;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withoutPartnerBrand (NEO-212: no partner names on screen)", () => {
  it("shows the NOA model as DAM and drops the brand everywhere else", async () => {
    const { withoutPartnerBrand } = await importService(true);
    expect(withoutPartnerBrand("Ficha de Paciente previa al tratamiento OrthoApnea NOA")).toBe("Ficha de Paciente previa al tratamiento DAM");
    expect(withoutPartnerBrand("OrthoApnea Classic")).toBe("DAM Classic");
    expect(withoutPartnerBrand("Vídeo ORTHOAPNEA")).toBe("Vídeo DAM");
    expect(withoutPartnerBrand("Morning aligner")).toBe("Morning aligner");
    expect(withoutPartnerBrand(null)).toBeNull();
  });
});

describe("checkConnection", () => {
  it("reports not connected, without calling fetch, when credentials aren't configured", async () => {
    const { checkConnection } = await importService(false);
    const status = await checkConnection();
    expect(status).toEqual({ connected: false, attemptsExhausted: false, reason: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs in via HTTP Basic auth and reports connected on success", async () => {
    const { checkConnection } = await importService(true);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ token: fakeJwt(1800) }) } as Response);

    const status = await checkConnection();
    expect(status).toEqual({ connected: true, attemptsExhausted: false });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://apneadock.test/api/login");
    expect(init?.method).toBe("POST");
    const authHeader = (init?.headers as Record<string, string>).Authorization;
    expect(authHeader).toBe(`Basic ${Buffer.from("rep@example.com:secret").toString("base64")}`);
  });

  it("reports attemptsExhausted only after repeated consecutive failures", async () => {
    const { checkConnection } = await importService(true);
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);

    // Cooldown between attempts is 15s — advance fake timers so each call actually retries the login.
    vi.useFakeTimers();
    try {
      let status = await checkConnection();
      expect(status.attemptsExhausted).toBe(false);
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(16_000);
        status = await checkConnection();
      }
      expect(status).toEqual({ connected: false, attemptsExhausted: true, reason: "credentials_rejected" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("validatePartnerResponse", () => {
  it("reports no discrepancies for an unknown action (nothing to validate against)", async () => {
    const { validatePartnerResponse } = await importService(true);
    expect(validatePartnerResponse("some_future_action", { anything: true })).toEqual({
      missingFields: [],
      unexpectedTopLevelFields: [],
    });
  });

  it("reports no discrepancies for a null/undefined payload", async () => {
    const { validatePartnerResponse } = await importService(true);
    expect(validatePartnerResponse("status_poll", null)).toEqual({ missingFields: [], unexpectedTopLevelFields: [] });
  });

  it("passes clean against the real captured treatment DTO fixture", async () => {
    const { validatePartnerResponse } = await importService(true);
    const report = validatePartnerResponse("status_poll", treatmentDtoFixture as Record<string, unknown>);
    expect(report.missingFields).toEqual([]);
    expect(report.unexpectedTopLevelFields).toEqual([]);
  });

  it("flags a field OrthoApnea silently removed as missingFields", async () => {
    const { validatePartnerResponse } = await importService(true);
    const mutated = { ...(treatmentDtoFixture as Record<string, unknown>) };
    delete mutated.statusId;
    const report = validatePartnerResponse("status_poll", mutated);
    expect(report.missingFields).toEqual(["statusId"]);
  });

  it("flags a field OrthoApnea added as unexpectedTopLevelFields, without failing", async () => {
    const { validatePartnerResponse } = await importService(true);
    const mutated = { ...(treatmentDtoFixture as Record<string, unknown>), brandNewField: "surprise" };
    const report = validatePartnerResponse("status_poll", mutated);
    expect(report.missingFields).toEqual([]);
    expect(report.unexpectedTopLevelFields).toEqual(["brandNewField"]);
  });

  it("flags a field OrthoApnea renamed as both missing (old name) and unexpected (new name)", async () => {
    const { validatePartnerResponse } = await importService(true);
    const mutated = { ...(treatmentDtoFixture as Record<string, unknown>) };
    delete mutated.statusId;
    mutated.status = 1; // hypothetical rename
    const report = validatePartnerResponse("status_poll", mutated);
    expect(report.missingFields).toEqual(["statusId"]);
    expect(report.unexpectedTopLevelFields).toEqual(["status"]);
  });
});

describe("reconcile helpers (Łukasz D3, 2026-10-03)", () => {
  it("reads OA's zone-less requestDate as Europe/Madrid time — 17:33:13 local was 15:33:13Z (shot S3, CEST)", async () => {
    const { oaLocalTimeToEpochMs } = await importService(true);
    expect(oaLocalTimeToEpochMs("2026-10-03T17:33:13.049")).toBe(Date.parse("2026-10-03T15:33:13.049Z"));
    // Winter time (CET, UTC+1).
    expect(oaLocalTimeToEpochMs("2026-01-15T10:00:00")).toBe(Date.parse("2026-01-15T09:00:00Z"));
    expect(oaLocalTimeToEpochMs("not a date")).toBeNull();
  });

  it("matches an OA order for the same product placed no earlier than the claim minus the slack; skips other products and older orders", async () => {
    const { findReconcileMatch } = await importService(true);
    const claimedAt = Date.parse("2026-10-03T15:33:00Z");
    const content = [
      { id: 1, product: { code: "002" }, requestDate: "2026-10-03T17:20:00.000" }, // 13 min before the claim
      { id: 2, product: { code: "003" }, requestDate: "2026-10-03T17:33:10.000" }, // other product
      { id: 3, product: { code: "002" }, requestDate: "2026-10-03T17:32:30.000" }, // 30 s before the claim: within the slack
      { id: 4, product: { code: "002" }, requestDate: "2026-10-03T17:40:00.000" },
    ];
    expect(findReconcileMatch(content, { productCode: "002", claimedAt, excludeIds: [] })?.id).toBe(3);
    expect(findReconcileMatch(content, { productCode: "002", claimedAt, excludeIds: ["3"] })?.id).toBe(4);
    expect(findReconcileMatch(content, { productCode: "004", claimedAt, excludeIds: [] })).toBeNull();
  });
});
