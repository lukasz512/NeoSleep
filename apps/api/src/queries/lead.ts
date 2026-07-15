import type { TenantContext } from "../context/TenantContext.js";
import {
  getLeadsPaginated,
  getLeadById,
  type GetLeadsFilters,
  type Lead,
} from "../db.js";

/**
 * QUERIES — Lead domain.
 *
 * Queries only read. No writes, no events, no audit log.
 * Return typed DTOs formatted for the API response.
 */

// ---------------------------------------------------------------------------
// SERIALIZATION
// ---------------------------------------------------------------------------

export interface LeadDto {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  country_code: string | null;
  region: string;
  source: string | null;
  assigned_to: string | null;
  converted_to_id: string | null;
  converted_to_type: string | null;
  converted_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(l: Lead): LeadDto {
  return {
    id:             l.id,
    name:           l.name,
    first_name:     l.first_name,
    last_name:      l.last_name,
    email:          l.email ?? "",
    phone:          l.phone ?? "",
    status:         l.status,
    country_code:   l.country_code ?? null,
    region:         l.region,
    source:         l.source ?? null,
    assigned_to:    l.assigned_to ?? null,
    converted_to_id:   l.converted_to_id ?? null,
    converted_to_type: l.converted_to_type ?? null,
    converted_at:      l.converted_at instanceof Date ? l.converted_at.toISOString() : (l.converted_at ?? null),
    metadata:       l.metadata ?? null,
    created_at:     l.created_at instanceof Date ? l.created_at.toISOString() : String(l.created_at),
    updated_at:     l.updated_at instanceof Date ? l.updated_at.toISOString() : String(l.updated_at),
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET LIST
// ---------------------------------------------------------------------------

export interface GetLeadListInput {
  search?: string;
  status?: string | string[];
  region?: string | string[];
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetLeadListResult {
  items: LeadDto[];
  total: number;
}

/**
 * Returns a paginated, filtered list of leads.
 * Admins see all leads including completed ones older than 24h.
 * Non-admins automatically have completed leads older than 24h hidden.
 */
export async function GetLeadListQuery(
  ctx: TenantContext,
  input: GetLeadListInput
): Promise<GetLeadListResult> {
  const filters: GetLeadsFilters = {
    search:                    input.search,
    status:                    input.status,
    region:                    input.region,
    hideCompletedOlderThan24h: ctx.user.role !== "admin",
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getLeadsPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map(toDto), total };
}

// ---------------------------------------------------------------------------
// QUERY: GET BY ID
// ---------------------------------------------------------------------------

/**
 * Returns a single lead by ID, or null if not found / deleted.
 */
export async function GetLeadByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<LeadDto | null> {
  const lead = await getLeadById(ctx.client, id);
  if (!lead) return null;
  return toDto(lead);
}
