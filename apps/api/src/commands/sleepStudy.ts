import type { TenantContext } from "../context/TenantContext.js";
import { insertSleepStudy, updateSleepStudy, deleteSleepStudy, getSleepStudyById, updatePatient, type SleepStudy } from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { SLEEP_STUDY_STATUSES, type SleepStudyInsert, type SleepStudyUpdate } from "../db/sleepStudy.js";

/**
 * COMMANDS — Sleep study domain.
 *
 * Each command validates, writes, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 *
 * Interpretation fields (interpretation, diagnosis_code, oa_indicated,
 * cpap_indicated) are writable by any authenticated staff role — no
 * field-level gate, per product decision (2026-08-24).
 */

function assertValidStatus(status: string | undefined): void {
  if (status !== undefined && !SLEEP_STUDY_STATUSES.includes(status as (typeof SLEEP_STUDY_STATUSES)[number])) {
    throw new ValidationError(`Invalid status '${status}' — expected one of ${SLEEP_STUDY_STATUSES.join(", ")}`);
  }
}

export interface CreateSleepStudyInput extends Omit<SleepStudyInsert, "patient_id"> {
  patient_id: string;
}

export async function CreateSleepStudyCommand(
  ctx: TenantContext,
  input: CreateSleepStudyInput
): Promise<SleepStudy> {
  if (!input.patient_id?.trim()) throw new ValidationError("patient_id is required");
  assertValidStatus(input.status);

  const study = await insertSleepStudy(ctx.client, input);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "SleepStudy",
    entity_id: study.id,
    entity_after: { patient_id: study.patient_id, status: study.status },
    request_id: ctx.requestId,
  });

  return study;
}

export type UpdateSleepStudyInput = SleepStudyUpdate;

export async function UpdateSleepStudyCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateSleepStudyInput
): Promise<SleepStudy | null> {
  if (!id?.trim()) throw new ValidationError("sleep study id is required");
  assertValidStatus(input.status);

  const before = await getSleepStudyById(ctx.client, id);
  if (!before) return null;

  const after = await updateSleepStudy(ctx.client, id, input);
  if (!after) return null;

  // Migration comment: "Patient.ahi_baseline is updated from ahi_score automatically."
  // Same transaction/client as the update above — commits or rolls back together.
  if (input.ahi_score !== undefined && input.ahi_score !== before.ahi_score) {
    await updatePatient(ctx.client, after.patient_id, { ahi_baseline: input.ahi_score ?? undefined });
  }

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "SleepStudy",
    entity_id: id,
    entity_before: { status: before.status },
    entity_after: { status: after.status },
    request_id: ctx.requestId,
  });

  return after;
}

/**
 * Hard delete — admin-only (enforced by requireRole at the route, not here;
 * commands trust the route's gate, same as DeletePatientCommand's caller).
 * Any linked treatment_plan (OrthoApnea) row survives with sleep_study_id
 * set to NULL (ON DELETE SET NULL, migration 017) — deleting a mistaken/test
 * study must not destroy a real OrthoApnea plan.
 */
export async function DeleteSleepStudyCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("sleep study id is required");

  const existing = await getSleepStudyById(ctx.client, id);
  if (!existing) throw new NotFoundError("SleepStudy", id);

  await deleteSleepStudy(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "delete",
    entity_type: "SleepStudy",
    entity_id: id,
    entity_before: { patient_id: existing.patient_id, status: existing.status },
    request_id: ctx.requestId,
  });
}
