import type { TenantContext } from "../context/TenantContext.js";
import { getSleepStudiesPaginated, getSleepStudyById, type GetSleepStudiesFilters, type SleepStudy } from "../db.js";

/**
 * QUERIES — Sleep study domain.
 *
 * Read-only. No writes, no audit log.
 */

export type SleepStudyDto = SleepStudy;

function toDto(s: SleepStudy): SleepStudyDto {
  return s;
}

export interface GetSleepStudyListInput {
  patient_id?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetSleepStudyListResult {
  items: SleepStudyDto[];
  total: number;
}

export async function GetSleepStudyListQuery(
  ctx: TenantContext,
  input: GetSleepStudyListInput
): Promise<GetSleepStudyListResult> {
  const filters: GetSleepStudiesFilters = {
    patient_id: input.patient_id,
    status: input.status,
    search: input.search,
  };

  const page = input.page ?? 1;
  const limit = input.limit ?? 50;
  const sortBy = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getSleepStudiesPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map(toDto), total };
}

export async function GetSleepStudyByIdQuery(ctx: TenantContext, id: string): Promise<SleepStudyDto | null> {
  const study = await getSleepStudyById(ctx.client, id);
  if (!study) return null;
  return toDto(study);
}
