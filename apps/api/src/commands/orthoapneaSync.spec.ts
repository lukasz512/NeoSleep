import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import { getActiveTenantSlugs } from "../db/tenant.js";

// Loaded via fs rather than a static JSON import — see orthoapnea-order.spec.ts's own comment.
const treatmentDtoFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../services/partners/__fixtures__/orthoapnea/treatmentDto.json", import.meta.url)), "utf-8")
) as Record<string, unknown>;

function fakeJwt(expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString(
    "base64url"
  );
  return `header.${payload}.signature`;
}

/**
 * SyncOrthoApneaTreatmentStatusesAllTenantsCommand fans SyncOrthoApneaTreatmentStatusesCommand
 * out across every tenant getActiveTenantSlugs() returns (see ADR-017 / the
 * command's own doc comment for why — tenantSlugFromHost() is a
 * single-tenant stub and would silently skip every tenant but one).
 *
 * getActiveTenantSlugs() is mocked here (only that one function — everything
 * else in db/tenant.js, notably withTenant, stays real — see db/tenant.spec.ts
 * for getActiveTenantSlugs' own real-DB test) to inject a SECOND, deliberately
 * non-existent tenant slug alongside the real 'test' schema. This is still a
 * real-Postgres test, not a mocked-DB one: 'test_missing_schema' is a
 * syntactically valid slug (passes sanitizeSlug) that simply has no matching
 * Postgres schema, so withTenant's SET LOCAL search_path silently falls
 * through to `public` (which has no partner_link table) and the actual query
 * genuinely fails against the real database — this is how a real
 * mid-migration or deprovisioned tenant would fail too, not a stubbed
 * failure. It's the cleanest way to exercise "one tenant's failure must not
 * abort the others" without touching another tenant's real data.
 */
vi.mock("../db/tenant.js", async () => {
  const actual = await vi.importActual<typeof import("../db/tenant.js")>("../db/tenant.js");
  return { ...actual, getActiveTenantSlugs: vi.fn() };
});

describe("SyncOrthoApneaTreatmentStatusesAllTenantsCommand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("runs the sync for every active tenant and isolates one tenant's failure from the rest", async () => {
    vi.mocked(getActiveTenantSlugs).mockResolvedValue(["test", "test_missing_schema"]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/login")) return { ok: true, status: 200, json: async () => ({ token: fakeJwt(1800) }) } as Response;
        if (url.includes("/api/treatments/DTO")) return { ok: true, status: 200, json: async () => treatmentDtoFixture } as Response;
        throw new Error(`Unmocked fetch call in test: ${url}`);
      })
    );

    const { SyncOrthoApneaTreatmentStatusesAllTenantsCommand } = await import("./orthoapneaSync.js");
    const result = await SyncOrthoApneaTreatmentStatusesAllTenantsCommand(`test-${Date.now()}`);

    expect(getActiveTenantSlugs).toHaveBeenCalled();
    expect(Object.keys(result.tenants).sort()).toEqual(["test", "test_missing_schema"]);

    // The real 'test' tenant ran successfully — a proper result object, not an error.
    expect(result.tenants.test).not.toHaveProperty("error");
    expect(result.tenants.test).toMatchObject({ checked: expect.any(Number), changed: expect.any(Number), failed: expect.any(Number) });

    // The non-existent schema failed — recorded per-tenant, not thrown.
    expect(result.tenants.test_missing_schema).toHaveProperty("error");
    expect(result.tenantsFailed).toBe(1);

    // Aggregate totals only reflect the tenant that actually ran.
    const testResult = result.tenants.test as { checked: number; changed: number; failed: number };
    expect(result.checked).toBe(testResult.checked);
    expect(result.changed).toBe(testResult.changed);
    expect(result.failed).toBe(testResult.failed);
  });
});
