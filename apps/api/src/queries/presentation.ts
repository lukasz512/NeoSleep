import type { TenantContext } from "../context/TenantContext.js";
import {
  getPresentationPaginated,
  getPresentationById,
  type GetPresentationFilters,
  type Presentation,
} from "../db.js";

/**
 * QUERIES — Presentation domain.
 *
 * Queries only read. No writes, no events, no audit log.
 * Return typed DTOs formatted for the API response.
 */

// ---------------------------------------------------------------------------
// SERIALIZATION
// ---------------------------------------------------------------------------

export interface PresentationDto {
  id: string;
  title: string;
  product_id: string | null;
  uploaded_by: string | null;
  file_url: string;
  /** Alias for file_url — kept for backward compat with PresentationViewer.vue. */
  url: string;
  thumbnail_url: string | null;
  locale: string;
  keywords: string[];
  tags: string[];
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(p: Presentation): PresentationDto {
  return {
    id:            p.id,
    title:         p.title,
    product_id:    p.product_id ?? null,
    uploaded_by:   p.uploaded_by ?? null,
    file_url:      p.file_url,
    url:           p.url,
    thumbnail_url: p.thumbnail_url ?? null,
    locale:        p.locale ?? "en",
    keywords:      p.keywords ?? [],
    tags:          p.tags ?? [],
    status:        p.status,
    metadata:      p.metadata ?? null,
    created_at:    p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
    updated_at:    p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET LIST
// ---------------------------------------------------------------------------

export interface GetPresentationListInput {
  search?: string;
  status?: string;
  locale?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetPresentationListResult {
  items: PresentationDto[];
  total: number;
}

/**
 * Returns a paginated, filtered list of presentations.
 */
export async function GetPresentationListQuery(
  ctx: TenantContext,
  input: GetPresentationListInput
): Promise<GetPresentationListResult> {
  const filters: GetPresentationFilters = {
    search: input.search,
    status: input.status,
    locale: input.locale,
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getPresentationPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);
  return { items: rows.map(toDto), total };
}

// ---------------------------------------------------------------------------
// QUERY: GET BY ID
// ---------------------------------------------------------------------------

/**
 * Returns a single presentation by ID, or null if not found / deleted.
 */
export async function GetPresentationByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<PresentationDto | null> {
  const presentation = await getPresentationById(ctx.client, id);
  if (!presentation) return null;
  return toDto(presentation);
}
