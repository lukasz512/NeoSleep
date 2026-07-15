import type { PoolClient } from "pg";
import { trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

export interface Presentation {
  id: string;
  title: string;
  product_id: string | null;
  uploaded_by: string | null;
  file_url: string;
  /** Alias for file_url — kept for backward compat with existing consumers (PresentationViewer.vue). */
  url: string;
  thumbnail_url: string | null;
  locale: string;
  keywords: string[];
  tags: string[];
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface GetPresentationFilters {
  search?: string;
  status?: string;
  locale?: string;
}

export interface InsertPresentationInput {
  title: string;
  /** No GET /api/v1/product endpoint exists yet — always null in practice, never resolved from client input. */
  product_id?: string | null;
  uploaded_by?: string | null;
  file_url: string;
  thumbnail_url?: string | null;
  locale?: string;
  keywords?: string[];
  tags?: string[];
  status?: string;
  metadata?: Record<string, unknown> | null;
}

export interface UpdatePresentationInput {
  title?: string;
  file_url?: string;
  thumbnail_url?: string | null;
  locale?: string;
  keywords?: string[];
  tags?: string[];
  status?: string;
  metadata?: Record<string, unknown> | null;
}

const PRESENTATION_SORT_COLUMNS = ["title", "status", "locale", "created_at"] as const;

function isPresentationSortColumn(s: string): s is (typeof PRESENTATION_SORT_COLUMNS)[number] {
  return PRESENTATION_SORT_COLUMNS.includes(s as (typeof PRESENTATION_SORT_COLUMNS)[number]);
}

const PRESENTATION_SELECT_COLS = `
  id, title, product_id, uploaded_by, file_url, file_url AS url,
  thumbnail_url, locale, keywords, tags, status, metadata, created_at, updated_at`.trim();

/**
 * Returns a paginated, filtered list of presentations.
 *
 * `client` must be a PoolClient already scoped to the calling tenant's schema
 * via withTenant() — the ROUTE layer owns tenant resolution and passes the
 * scoped client down here, exactly like organization.ts/patient.ts. This
 * function must never resolve its own tenant slug.
 *
 * (This replaces the old getPresentations()/getPresentationById() which used
 * to call withTenant(tenantSlugFromHost("")) INTERNALLY with a hardcoded
 * empty hostname — tenantSlugFromHost("") always falls through to
 * DEFAULT_TENANT_SLUG regardless of which tenant is actually asking, which
 * meant every request, from every tenant, silently read the default tenant's
 * presentations. See routes/presentation.ts for the fix: the route now calls
 * withTenant(tenantSlugFromHost(req.hostname), ...) and passes the resulting
 * scoped client into the query layer, same as every other entity.)
 */
export async function getPresentationPaginated(
  client: PoolClient,
  filters: GetPresentationFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: Presentation[]; total: number }> {
  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(`LOWER(title) LIKE $${paramIndex}`);
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  if (filters.status?.trim()) {
    conditions.push(`status = $${paramIndex}`);
    params.push(filters.status.trim());
    paramIndex++;
  }
  if (filters.locale?.trim()) {
    conditions.push(`locale = $${paramIndex}`);
    params.push(filters.locale.trim());
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderCol = isPresentationSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "created_at" : `"${orderCol}"`;

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM presentation ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<Presentation>(
      `SELECT ${PRESENTATION_SELECT_COLS}
       FROM presentation ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPresentationPaginated", err);
  }
}

export async function getPresentationById(client: PoolClient, id: string): Promise<Presentation | null> {
  try {
    const result = await client.query<Presentation>(
      `SELECT ${PRESENTATION_SELECT_COLS} FROM presentation WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPresentationById", err);
  }
}

/**
 * Inserts a presentation record using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 * No BEGIN/COMMIT here — the caller owns the transaction boundary.
 */
export async function insertPresentation(client: PoolClient, input: InsertPresentationInput): Promise<Presentation> {
  const title = trimOrEmpty(input.title);
  if (!title) throw new ValidationError("Presentation title is required");
  const fileUrl = trimOrEmpty(input.file_url);
  if (!fileUrl) throw new ValidationError("Presentation file_url is required");

  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO presentation
         (title, product_id, uploaded_by, file_url, thumbnail_url, locale, keywords, tags, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9, $10)
       RETURNING id`,
      [
        title,
        input.product_id ?? null,
        input.uploaded_by ?? null,
        fileUrl,
        trimOrNull(input.thumbnail_url),
        trimOrEmpty(input.locale) || "en",
        input.keywords ?? [],
        input.tags ?? [],
        trimOrEmpty(input.status) || "active",
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    const id = result.rows[0]!.id;

    const presentation = await getPresentationById(client, id);
    if (!presentation) throw new DatabaseError("insertPresentation", new Error("Insert returned no rows"));
    return presentation;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertPresentation", err);
  }
}

/**
 * Updates presentation fields using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 * `product_id`/`uploaded_by` are intentionally not updatable here — product_id
 * has no resolvable source yet (no product endpoint) and uploaded_by is fixed
 * at creation time (set from the creating user, never reassigned).
 */
export async function updatePresentation(client: PoolClient, id: string, input: UpdatePresentationInput): Promise<Presentation | null> {
  const existing = await getPresentationById(client, id);
  if (!existing) return null;

  try {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (input.title !== undefined) {
      params.push(trimOrEmpty(input.title) || existing.title);
      sets.push(`title = $${idx++}`);
    }
    if (input.file_url !== undefined) {
      params.push(trimOrEmpty(input.file_url) || existing.file_url);
      sets.push(`file_url = $${idx++}`);
    }
    if (input.thumbnail_url !== undefined) {
      params.push(trimOrNull(input.thumbnail_url));
      sets.push(`thumbnail_url = $${idx++}`);
    }
    if (input.locale !== undefined) {
      params.push(trimOrEmpty(input.locale) || "en");
      sets.push(`locale = $${idx++}`);
    }
    if (input.keywords !== undefined) {
      params.push(input.keywords);
      sets.push(`keywords = $${idx++}::text[]`);
    }
    if (input.tags !== undefined) {
      params.push(input.tags);
      sets.push(`tags = $${idx++}::text[]`);
    }
    if (input.status !== undefined) {
      params.push(input.status);
      sets.push(`status = $${idx++}`);
    }
    if (input.metadata !== undefined) {
      params.push(input.metadata ? JSON.stringify(input.metadata) : null);
      sets.push(`metadata = $${idx++}`);
    }

    params.push(id);
    await client.query(`UPDATE presentation SET ${sets.join(", ")} WHERE id = $${idx}`, params);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updatePresentation", err);
  }

  return getPresentationById(client, id);
}
