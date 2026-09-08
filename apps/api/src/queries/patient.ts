import type { TenantContext } from "../context/TenantContext.js";
import {
  getPatientsPaginated,
  getPatientById,
  getTerritoryPath,
  type GetPatientsFilters,
  type Patient,
  type TerritoryPathNode,
} from "../db.js";

/**
 * QUERIES — Patient domain.
 *
 * Read-only. No writes, no events, no audit log.
 */

// ---------------------------------------------------------------------------
// SERIALIZATION
// ---------------------------------------------------------------------------

export interface PatientDto {
  id: string;
  name: string;
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  practitioner_id: string | null;
  practitioner_name: string | null;
  diagnosis_code: Record<string, unknown> | null;
  ahi_baseline: number | null;
  cpap_device: string | null;
  medical_record: string | null;
  region: string;
  territory_id: string | null;
  /** Root-first breadcrumb ("mx"/"cdmx"/"polanco") — only populated on the
   *  single-record GetPatientByIdQuery (one extra query, fine for a detail
   *  view); the paginated list query omits it to avoid N+1. Null when
   *  territory_id is unset or points at a deleted/unknown node — the
   *  frontend falls back to the flat `region` text in that case. */
  territory_path: TerritoryPathNode[] | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(p: Patient & { name: string }, territoryPath: TerritoryPathNode[] | null = null): PatientDto {
  return {
    id:              p.id,
    name:            p.name,
    salutation:      p.salutation ?? null,
    first_name:      p.first_name,
    last_name:       p.last_name,
    email:           p.email ?? null,
    phone:           p.phone ?? null,
    practitioner_id: p.practitioner_id ?? null,
    practitioner_name: p.practitioner_name ?? null,
    diagnosis_code:  p.diagnosis_code ?? null,
    ahi_baseline:    p.ahi_baseline ?? null,
    cpap_device:     p.cpap_device ?? null,
    medical_record:  p.medical_record ?? null,
    region:          p.region,
    territory_id:    p.territory_id ?? null,
    territory_path:  territoryPath && territoryPath.length > 0 ? territoryPath : null,
    status:          p.status,
    metadata:        p.metadata ?? null,
    created_at:      p.created_at,
    updated_at:      p.updated_at,
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET LIST
// ---------------------------------------------------------------------------

export interface GetPatientListInput {
  search?: string;
  status?: string;
  region?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetPatientListResult {
  items: PatientDto[];
  total: number;
}

export async function GetPatientListQuery(
  ctx: TenantContext,
  input: GetPatientListInput
): Promise<GetPatientListResult> {
  const filters: GetPatientsFilters = {
    search: input.search,
    status: input.status,
    region: input.region,
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getPatientsPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map((row) => toDto(row)), total };
}

// ---------------------------------------------------------------------------
// QUERY: GET BY ID
// ---------------------------------------------------------------------------

export async function GetPatientByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<PatientDto | null> {
  const patient = await getPatientById(ctx.client, id);
  if (!patient) return null;
  const territoryPath = patient.territory_id ? await getTerritoryPath(ctx.client, patient.territory_id) : null;
  return toDto(patient, territoryPath);
}
