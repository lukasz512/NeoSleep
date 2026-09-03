import type { TenantContext } from "../context/TenantContext.js";
import { insertTreatmentPlan, updateTreatmentPlan, getTreatmentPlanById, getSleepStudyById, type TreatmentPlan } from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";
import {
  TREATMENT_PLAN_TYPES,
  TREATMENT_PLAN_STATUSES,
  type TreatmentPlanInsert,
  type TreatmentPlanUpdate,
} from "../db/treatmentPlan.js";

/**
 * COMMANDS — Treatment plan domain.
 *
 * Each command validates, writes, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 *
 * Does NOT call out to the OrthoApnea partner API — this command only reads/
 * writes the local treatment_plan row. Partner order submission is a separate,
 * not-yet-built piece (see services/partners/orthoapnea.ts header comment).
 */

function assertValidType(type: string): void {
  if (!TREATMENT_PLAN_TYPES.includes(type as (typeof TREATMENT_PLAN_TYPES)[number])) {
    throw new ValidationError(`Invalid type '${type}' — expected one of ${TREATMENT_PLAN_TYPES.join(", ")}`);
  }
}

function assertValidStatus(status: string | undefined): void {
  if (status !== undefined && !TREATMENT_PLAN_STATUSES.includes(status as (typeof TREATMENT_PLAN_STATUSES)[number])) {
    throw new ValidationError(`Invalid status '${status}' — expected one of ${TREATMENT_PLAN_STATUSES.join(", ")}`);
  }
}

export type CreateTreatmentPlanInput = TreatmentPlanInsert;

export async function CreateTreatmentPlanCommand(
  ctx: TenantContext,
  input: CreateTreatmentPlanInput
): Promise<TreatmentPlan> {
  if (!input.patient_id?.trim()) throw new ValidationError("patient_id is required");
  if (!input.sleep_study_id?.trim()) throw new ValidationError("sleep_study_id is required");
  assertValidType(input.type);
  assertValidStatus(input.status);

  const study = await getSleepStudyById(ctx.client, input.sleep_study_id);
  if (!study) throw new ValidationError("sleep_study_id does not reference an existing sleep study");
  if (study.patient_id !== input.patient_id) {
    throw new ValidationError("sleep_study_id does not belong to the given patient_id");
  }

  const plan = await insertTreatmentPlan(ctx.client, input);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "TreatmentPlan",
    entity_id: plan.id,
    entity_after: { patient_id: plan.patient_id, type: plan.type, status: plan.status },
    request_id: ctx.requestId,
  });

  return plan;
}

export type UpdateTreatmentPlanInput = TreatmentPlanUpdate;

export async function UpdateTreatmentPlanCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateTreatmentPlanInput
): Promise<TreatmentPlan | null> {
  if (!id?.trim()) throw new ValidationError("treatment plan id is required");
  if (input.type !== undefined) assertValidType(input.type);
  assertValidStatus(input.status);

  const before = await getTreatmentPlanById(ctx.client, id);
  if (!before) return null;

  const after = await updateTreatmentPlan(ctx.client, id, input);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "TreatmentPlan",
    entity_id: id,
    entity_before: { status: before.status },
    entity_after: { status: after.status },
    request_id: ctx.requestId,
  });

  return after;
}
