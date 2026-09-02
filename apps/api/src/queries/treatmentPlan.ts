import type { TenantContext } from "../context/TenantContext.js";
import {
  getTreatmentPlansPaginated,
  getTreatmentPlanById,
  type GetTreatmentPlansFilters,
  type TreatmentPlan,
} from "../db.js";

/**
 * QUERIES — Treatment plan domain.
 *
 * Read-only. No writes, no audit log.
 */

export type TreatmentPlanDto = TreatmentPlan;

function toDto(t: TreatmentPlan): TreatmentPlanDto {
  return t;
}

export interface GetTreatmentPlanListInput {
  patient_id?: string;
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetTreatmentPlanListResult {
  items: TreatmentPlanDto[];
  total: number;
}

export async function GetTreatmentPlanListQuery(
  ctx: TenantContext,
  input: GetTreatmentPlanListInput
): Promise<GetTreatmentPlanListResult> {
  const filters: GetTreatmentPlansFilters = {
    patient_id: input.patient_id,
    type: input.type,
    status: input.status,
    search: input.search,
  };

  const page = input.page ?? 1;
  const limit = input.limit ?? 50;
  const sortBy = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getTreatmentPlansPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map(toDto), total };
}

export async function GetTreatmentPlanByIdQuery(ctx: TenantContext, id: string): Promise<TreatmentPlanDto | null> {
  const plan = await getTreatmentPlanById(ctx.client, id);
  if (!plan) return null;
  return toDto(plan);
}
