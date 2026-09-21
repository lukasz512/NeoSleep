import type { TenantContext } from "../context/TenantContext.js";
import {
  getPractitionerPaginated,
  getPractitionerById,
  getTerritoryPath,
  getOrganizationAffiliations,
  getUserPrimaryOrganizationId,
  type GetPractitionerFilters,
  type Practitioner,
  type TerritoryPathNode,
  type OrganizationAffiliation,
} from "../db.js";
import { formatDisplayName } from "../utils/personName.js";
import { getAllowedScopePaths, assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";

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
  organization_id: string | null;
  institution: string;
  region: string;
  territory_id: string | null;
  territory_name: string | null;
  /** Root-first ancestor chain — only populated on the single-record
   *  GetPractitionerByIdQuery (mirrors queries/patient.ts's own territory_path,
   *  same no-N+1-on-the-list-query reasoning). */
  territory_path: TerritoryPathNode[] | null;
  influence_tier: string;
  status: string;
  language: string | null;
  national_ids: Record<string, string> | null;
  social_links: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  /** Only populated on the single-record GetPractitionerByIdQuery (same
   *  no-N+1-on-the-list-query reasoning as territory_path above). */
  organizations: OrganizationAffiliation[] | null;
  /** The CALLING rep's own primary clinic for this practitioner
   *  (practitioner_assignment.primary_org_id) — null for admin/manager, who
   *  have no personal assignment row by design. See docs/stories/pwa-medico-view.md. */
  my_primary_organization_id: string | null;
}

function toDto(
  p: Practitioner,
  territoryPath: TerritoryPathNode[] | null = null,
  organizations: OrganizationAffiliation[] | null = null,
  myPrimaryOrganizationId: string | null = null
): PractitionerDto {
  const name = formatDisplayName(p);
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
    organization_id:   p.organization_id ?? null,
    institution:       p.institution ?? "",
    region:            p.region,
    territory_id:      p.territory_id ?? null,
    territory_name:    p.territory_name ?? null,
    territory_path:    territoryPath && territoryPath.length > 0 ? territoryPath : null,
    influence_tier:    p.influence_tier ?? "C",
    status:            p.status ?? "active",
    language:          p.language ?? null,
    national_ids:      p.national_ids ?? null,
    social_links:      p.social_links ?? null,
    created_at:        p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
    updated_at:        p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
    organizations:     organizations,
    my_primary_organization_id: myPrimaryOrganizationId,
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
  organization_id?: string;
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
    organization_id: input.organization_id,
    scopePaths: await getAllowedScopePaths(ctx.client, ctx.user.roles),
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getPractitionerPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map((row) => toDto(row)), total };
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
  await assertTerritoryAccessByTerritoryId(ctx, practitioner.territory_id);
  const territoryPath = practitioner.territory_id ? await getTerritoryPath(ctx.client, practitioner.territory_id) : null;
  const organizations = await getOrganizationAffiliations(ctx.client, id);
  // Only a rep has a personal practitioner_assignment row by design — see
  // PractitionerDto.my_primary_organization_id's own doc comment.
  const myPrimaryOrganizationId = ctx.user.role === "rep"
    ? await getUserPrimaryOrganizationId(ctx.client, id, ctx.user.id)
    : null;
  return toDto(practitioner, territoryPath, organizations, myPrimaryOrganizationId);
}
