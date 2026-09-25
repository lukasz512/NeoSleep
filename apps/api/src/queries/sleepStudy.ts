import type { TenantContext } from "../context/TenantContext.js";
import { getSleepStudiesPaginated, getSleepStudyById, type GetSleepStudiesFilters, type SleepStudy } from "../db.js";
import { getLatestSleepStudyIdForPatient } from "../db/sleepStudy.js";
import { GetPatientByIdQuery } from "./patient.js";
import { NotFoundError } from "../errors.js";

/**
 * The latest sleep study's id only — what a device order needs
 * (treatment_plan.sleep_study_id is required) and the one sleep-study fact
 * the commercial field force may still see: every clinical field (AHI,
 * SpO2, interpretation, results) is admin/doctor only since 2026-09-25.
 * Territory-checked through GetPatientByIdQuery.
 */
export async function GetLatestSleepStudyRefQuery(ctx: TenantContext, patientId: string): Promise<{ id: string | null }> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);
  return { id: await getLatestSleepStudyIdForPatient(ctx.client, patientId) };
}

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
