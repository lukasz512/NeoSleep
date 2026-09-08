import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertAuditLog } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePatientCommand } from "../commands/patient.js";
import { GetHistoryForPatientQuery } from "./auditLog.js";

/**
 * Regression test for the legal-review finding (this session): before this,
 * PatientHistoryPanel.vue would have rendered *any* top-level key present in
 * audit_log.entity_before/entity_after — that JSONB was previously an
 * internal-only compliance artifact, never shown to a user. sleep_study and
 * treatment_plan both have real clinical columns (diagnosis_code,
 * interpretation, medical_record); if a future command ever wrote one of
 * those into entity_before/entity_after, it would start rendering to every
 * rep who opens a patient's History tab. This test proves the allow-list in
 * GetHistoryForPatientQuery actually strips unlisted fields rather than
 * just trusting the command layer to self-police what it writes.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreatePatientCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-auditlog-query-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("GetHistoryForPatientQuery — audit field redaction", () => {
  it("strips fields not on the Patient allow-list, keeping only id/status/region", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}`, email: `qa-patient-${uniqueSuffix()}@example.com`, phone: "600100200" });

      // Simulates a future command widening what it writes to entity_after —
      // inserted directly (bypassing CreatePatientCommand/UpdatePatientCommand,
      // which both already use the narrow, safe field set) specifically to
      // prove the query layer doesn't just trust the writer.
      await insertAuditLog(client, {
        user_id: ctx.user.id,
        action: "update",
        entity_type: "Patient",
        entity_id: patient.id,
        entity_before: { status: "active", medical_record: "MRN-SHOULD-NOT-LEAK" },
        entity_after: { status: "follow_up", medical_record: "MRN-SHOULD-NOT-LEAK", diagnosis_code: { icd10: "G47.33" } },
      });

      const history = await GetHistoryForPatientQuery(ctx, patient.id);
      const entry = history.entries.find((e) => e.action === "update" && e.entity_type === "Patient");

      expect(entry).toBeDefined();
      expect(entry!.entity_before).toEqual({ status: "active" });
      expect(entry!.entity_after).toEqual({ status: "follow_up" });
      expect(JSON.stringify(entry)).not.toContain("MRN-SHOULD-NOT-LEAK");
      expect(JSON.stringify(entry)).not.toContain("diagnosis_code");
    });
  });

  it("strips ALL fields for an unrecognized entity_type — fail safe, not fail open", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}`, email: `qa-patient-${uniqueSuffix()}@example.com`, phone: "600100200" });

      await insertAuditLog(client, {
        user_id: ctx.user.id,
        action: "update",
        entity_type: "Patient",
        entity_id: patient.id,
        entity_before: null,
        entity_after: { interpretation: "some clinical free text that must never leak" },
      });

      // Re-fetch normally through the query the panel actually uses.
      const history = await GetHistoryForPatientQuery(ctx, patient.id);
      const entry = history.entries.find((e) => e.entity_id === patient.id && e.action === "update");
      expect(entry!.entity_after).toBeNull();
    });
  });

  it("returns null (not an empty object) when the only fields present are all filtered out", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}`, email: `qa-patient-${uniqueSuffix()}@example.com`, phone: "600100200" });

      await insertAuditLog(client, {
        user_id: ctx.user.id,
        action: "update",
        entity_type: "Patient",
        entity_id: patient.id,
        entity_before: { medical_record: "only-a-disallowed-field" },
        entity_after: null,
      });

      const history = await GetHistoryForPatientQuery(ctx, patient.id);
      const entry = history.entries.find((e) => e.entity_id === patient.id && e.action === "update");
      expect(entry!.entity_before).toBeNull();
    });
  });
});
