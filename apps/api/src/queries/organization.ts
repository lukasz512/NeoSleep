import type { PoolClient } from "pg";
import type { TenantContext } from "../context/TenantContext.js";
import {
  getOrganizationPaginated,
  getOrganizationById,
  getPublicSpecialists,
  getTerritoryPath,
  type GetOrganizationFilters,
  type Organization,
  type PublicSpecialistRow,
  type TerritoryPathNode,
} from "../db.js";
import { getAllowedScopePaths, assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";

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
  territory_name: string | null;
  /** Root-first ancestor chain — only populated on the single-record
   *  GetOrganizationByIdQuery (mirrors queries/patient.ts's territory_path). */
  territory_path: TerritoryPathNode[] | null;
  phone: string;
  email: string;
  website: string;
  google_link: string;
  /** Geocoded from the address fields (see services/geocoding.ts) — null
   *  until geocoded. Powers HCODetailView's location map. */
  latitude: number | null;
  longitude: number | null;
  specialties: string[];
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(o: Organization, territoryPath: TerritoryPathNode[] | null = null): OrganizationDto {
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
    territory_name: o.territory_name ?? null,
    territory_path: territoryPath && territoryPath.length > 0 ? territoryPath : null,
    phone:         o.phone ?? "",
    email:         o.email ?? "",
    website:       o.website ?? "",
    google_link:   o.google_link ?? "",
    latitude:      o.latitude ?? null,
    longitude:     o.longitude ?? null,
    specialties:   o.specialties ?? [],
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
    scopePaths: await getAllowedScopePaths(ctx.client, ctx.user.roles),
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getOrganizationPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map((row) => toDto(row)), total };
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
  await assertTerritoryAccessByTerritoryId(ctx, organization.territory_id);
  const territoryPath = organization.territory_id ? await getTerritoryPath(ctx.client, organization.territory_id) : null;
  return toDto(organization, territoryPath);
}

// ---------------------------------------------------------------------------
// QUERY: PUBLIC SPECIALIST SEARCH (unauthenticated — "find a specialist" map)
// ---------------------------------------------------------------------------

const PUBLIC_SPECIALISTS_LIMIT = 100;

/**
 * Called from routes/public.ts — no TenantContext/session (same reasoning as
 * GetPublicLeadInfoQuery above: public routes take a raw PoolClient, not an
 * authenticated ctx). The DB row is already a narrow, public-safe shape —
 * see getPublicSpecialists in db/organization.ts.
 */
export async function GetPublicSpecialistsQuery(client: PoolClient, search?: string): Promise<PublicSpecialistRow[]> {
  return getPublicSpecialists(client, { search, limit: PUBLIC_SPECIALISTS_LIMIT });
}
