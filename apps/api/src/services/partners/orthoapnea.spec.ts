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

describe("checkConnection", () => {
  it("reports not connected, without calling fetch, when credentials aren't configured", async () => {
    const { checkConnection } = await importService(false);
    const status = await checkConnection();
    expect(status).toEqual({ connected: false, attemptsExhausted: false });
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
      expect(status).toEqual({ connected: false, attemptsExhausted: true });
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
