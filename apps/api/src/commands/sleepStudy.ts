import type { TenantContext } from "../context/TenantContext.js";
import { requirePatientInScope } from "../queries/entityAccess.js";
import { insertSleepStudy, updateSleepStudy, deleteSleepStudy, getSleepStudyById, updatePatient, type SleepStudy } from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { SLEEP_STUDY_STATUSES, SLEEP_STUDY_TYPES, type SleepStudyInsert, type SleepStudyUpdate } from "../db/sleepStudy.js";

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

function assertValidType(studyType: string | undefined): void {
  if (studyType !== undefined && !SLEEP_STUDY_TYPES.includes(studyType as (typeof SLEEP_STUDY_TYPES)[number])) {
    throw new ValidationError(`Invalid study_type '${studyType}' — expected one of ${SLEEP_STUDY_TYPES.join(", ")}`);
  }
}

/**
 * A study can't be dated in the future (Łukasz, NEO-132). One day of slack
 * over UTC's today covers clinics east of UTC, whose local "today" is already
 * UTC's tomorrow for part of the day.
 */
function assertStudyDateNotFuture(studyDate: string | null | undefined): void {
  if (!studyDate) return;
  const v = studyDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ValidationError("study_date must be YYYY-MM-DD", "study_date");
  const latest = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (v > latest) throw new ValidationError("study_date cannot be in the future", "study_date");
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
  assertValidType(input.study_type);
  assertStudyDateNotFuture(input.study_date);
  // CORE-104: only for a patient the caller may see (a doctor: their own).
  await requirePatientInScope(ctx, input.patient_id);

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
  assertValidType(input.study_type);
  assertStudyDateNotFuture(input.study_date);

  const before = await getSleepStudyById(ctx.client, id);
  if (!before) return null;
  await requirePatientInScope(ctx, before.patient_id);

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
  await requirePatientInScope(ctx, existing.patient_id);

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
