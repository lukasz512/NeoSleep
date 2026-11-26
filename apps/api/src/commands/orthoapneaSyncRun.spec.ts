import { describe, it, expect, vi } from "vitest";
import { withTenant } from "../db/tenant.js";
import { listPartnerSyncRuns } from "../db/partnerSyncRun.js";

/**
 * A sync that throws records its error on the run row and rethrows (admin
 * lab sync card). Real Postgres: only the worklist query is made to fail, the
 * partner_sync_run writes are real.
 */
vi.mock("../db/partnerLink.js", async () => {
  const actual = await vi.importActual<typeof import("../db/partnerLink.js")>("../db/partnerLink.js");
  return {
    ...actual,
    getPartnerLinksNeedingStatusSync: vi.fn(async () => {
      throw new Error("worklist exploded");
    }),
  };
});

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

describe("SyncOrthoApneaTreatmentStatusesCommand run log", () => {
  it("records the error on the run and rethrows when the sync throws", async () => {
    const { SyncOrthoApneaTreatmentStatusesCommand } = await import("./orthoapneaSync.js");

    await expect(SyncOrthoApneaTreatmentStatusesCommand(TENANT_SLUG, `test-${Date.now()}`, "schedule")).rejects.toThrow(
      "worklist exploded"
    );

    const runs = await withTenant(TENANT_SLUG, (client) => listPartnerSyncRuns(client, "orthoapnea", 1));
    expect(runs[0]).toMatchObject({ trigger: "schedule", checked: null, changed: null, failed: null });
    expect(runs[0]!.error).toContain("worklist exploded");
    expect(runs[0]!.finished_at).not.toBeNull();
  });
});
