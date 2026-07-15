import type { TenantContext } from "../context/TenantContext.js";
import {
  getOrganizationPaginated,
  getOrganizationById,
  type GetOrganizationFilters,
  type Organization,
} from "../db.js";

/**
 * QUERIES — Organization (HCO) domain.
 *
 * Queries only read. No writes, no events, no audit log.
 * Return typed DTOs formatted for the API response.
 */

// ---------------------------------------------------------------------------
// SERIALIZATION
// ---------------------------------------------------------------------------

export interface OrganizationDto {
  id: string;
  name: string;
  type: string;
  identifiers: Record<string, string> | null;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  region: string;
  territory_id: string | null;
  phone: string;
  email: string;
  website: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(o: Organization): OrganizationDto {
  return {
    id:            o.id,
    name:          o.name,
    type:          o.type ?? "",
    identifiers:   o.identifiers ?? null,
    address_line1: o.address_line1 ?? "",
    city:          o.city ?? "",
    state:         o.state ?? "",
    postal_code:   o.postal_code ?? "",
    country_code:  o.country_code ?? "",
    region:        o.region ?? "",
    territory_id:  o.territory_id ?? null,
    phone:         o.phone ?? "",
    email:         o.email ?? "",
    website:       o.website ?? "",
    status:        o.status,
    metadata:      o.metadata ?? null,
    created_at:    o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
    updated_at:    o.updated_at instanceof Date ? o.updated_at.toISOString() : String(o.updated_at),
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET LIST
// ---------------------------------------------------------------------------

export interface GetOrganizationListInput {
  search?: string;
  type?: string;
  region?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetOrganizationListResult {
  items: OrganizationDto[];
  total: number;
}

/**
 * Returns a paginated, filtered list of organizations.
 */
export async function GetOrganizationListQuery(
  ctx: TenantContext,
  input: GetOrganizationListInput
): Promise<GetOrganizationListResult> {
  const filters: GetOrganizationFilters = {
    search: input.search,
    type:   input.type,
    region: input.region,
    status: input.status,
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getOrganizationPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map(toDto), total };
}

// ---------------------------------------------------------------------------
// QUERY: GET BY ID
// ---------------------------------------------------------------------------

/**
 * Returns a single organization by ID, or null if not found / deleted.
 */
export async function GetOrganizationByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<OrganizationDto | null> {
  const organization = await getOrganizationById(ctx.client, id);
  if (!organization) return null;
  return toDto(organization);
}
