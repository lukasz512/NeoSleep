import type { TenantContext } from "../context/TenantContext.js";
import {
  getTerritoryPaginated,
  getTerritoryById,
  getTerritoryPath,
  type GetTerritoryFilters,
  type Territory,
} from "../db.js";

/**
 * QUERIES — Territory (geographic hierarchy) domain.
 *
 * Queries only read. No writes, no events, no audit log.
 */

export interface TerritoryDto {
  id: string;
  name: string;
  code: string | null;
  country_code: string;
  parent_id: string | null;
  kind: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(t: Territory): TerritoryDto {
  return {
    id:           t.id,
    name:         t.name,
    code:         t.code,
    country_code: t.country_code,
    parent_id:    t.parent_id,
    kind:         t.kind,
    metadata:     t.metadata ?? null,
    created_at:   t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
    updated_at:   t.updated_at instanceof Date ? t.updated_at.toISOString() : String(t.updated_at),
  };
}

export interface GetTerritoryListInput {
  search?: string;
  country_code?: string;
  kind?: string;
  parent_id?: string | null;
  page?: number;
  limit?: number;
}

export interface GetTerritoryListResult {
  items: TerritoryDto[];
  total: number;
}

export async function GetTerritoryListQuery(
  ctx: TenantContext,
  input: GetTerritoryListInput
): Promise<GetTerritoryListResult> {
  const filters: GetTerritoryFilters = {
    search: input.search,
    country_code: input.country_code,
    kind: input.kind,
    parent_id: input.parent_id,
  };
  const page = input.page ?? 1;
  const limit = input.limit ?? 100;

  const { rows, total } = await getTerritoryPaginated(ctx.client, filters, page, limit);
  return { items: rows.map(toDto), total };
}

export async function GetTerritoryByIdQuery(ctx: TenantContext, id: string): Promise<TerritoryDto | null> {
  const territory = await getTerritoryById(ctx.client, id);
  if (!territory) return null;
  return toDto(territory);
}

/**
 * Root-first breadcrumb (e.g. [{code:"mx",...}, {code:"cdmx",...}, {code:"polanco",...}])
 * for a given territory id — see getTerritoryPath in db/territory.ts.
 */
export async function GetTerritoryPathQuery(ctx: TenantContext, id: string) {
  return getTerritoryPath(ctx.client, id);
}
