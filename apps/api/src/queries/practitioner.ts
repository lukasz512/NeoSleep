import type { TenantContext } from "../context/TenantContext.js";
import {
  getPractitionerPaginated,
  getPractitionerById,
  type GetPractitionerFilters,
  type Practitioner,
} from "../db.js";

/**
 * QUERIES — Practitioner domain.
 *
 * Read-only. No writes, no events, no audit log.
 */

// ---------------------------------------------------------------------------
// SERIALIZATION
// ---------------------------------------------------------------------------

export interface PractitionerDto {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  salutation: string | null;
  email: string;
  phone: string;
  // primary_specialty is the canonical field; specialty is the legacy alias
  primary_specialty: string;
  specialty: string;
  institution: string;
  region: string;
  influence_tier: string;
  status: string;
  language: string | null;
  national_ids: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

function toDto(p: Practitioner): PractitionerDto {
  const name = `${p.salutation ? p.salutation + " " : ""}${p.first_name} ${p.last_name}`.trim();
  return {
    id:                p.id,
    name,
    first_name:        p.first_name,
    last_name:         p.last_name,
    salutation:        p.salutation ?? null,
    email:             p.email ?? "",
    phone:             p.phone ?? "",
    primary_specialty: p.primary_specialty ?? "",
    specialty:         p.primary_specialty ?? "",  // legacy alias
    institution:       p.institution ?? "",
    region:            p.region,
    influence_tier:    p.influence_tier ?? "C",
    status:            p.status ?? "active",
    language:          p.language ?? null,
    national_ids:      p.national_ids ?? null,
    created_at:        p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
    updated_at:        p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET LIST
// ---------------------------------------------------------------------------

export interface GetPractitionerListInput {
  search?: string;
  specialty?: string | string[];
  institution?: string | string[];
  region?: string | string[];
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetPractitionerListResult {
  items: PractitionerDto[];
  total: number;
}

export async function GetPractitionerListQuery(
  ctx: TenantContext,
  input: GetPractitionerListInput
): Promise<GetPractitionerListResult> {
  const filters: GetPractitionerFilters = {
    search:      input.search,
    specialty:   input.specialty,
    institution: input.institution,
    region:      input.region,
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getPractitionerPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map(toDto), total };
}

// ---------------------------------------------------------------------------
// QUERY: GET BY ID
// ---------------------------------------------------------------------------

export async function GetPractitionerByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<PractitionerDto | null> {
  const practitioner = await getPractitionerById(ctx.client, id);
  if (!practitioner) return null;
  return toDto(practitioner);
}
