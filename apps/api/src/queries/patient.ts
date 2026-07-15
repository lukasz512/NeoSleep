import type { TenantContext } from "../context/TenantContext.js";
import {
  getPatientsPaginated,
  getPatientById,
  type GetPatientsFilters,
  type Patient,
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
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(p: Patient & { name: string }): PatientDto {
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
  return { items: rows.map(toDto), total };
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
  return toDto(patient);
}
