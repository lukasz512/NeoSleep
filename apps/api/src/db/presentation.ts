import { AppError, DatabaseError } from "../errors.js";
import { withTenant, tenantSlugFromHost } from "./tenant.js";

export interface Presentation {
  id: string;
  title: string;
  product_id: string | null;
  uploaded_by: string | null;
  file_url: string;
  /** Alias for file_url — kept for backward compat with existing consumers. */
  url: string;
  thumbnail_url: string | null;
  locale: string | null;
  tags: string[];
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

const PRESENTATION_SELECT_COLS = `
  id, title, product_id, uploaded_by, file_url, file_url AS url,
  thumbnail_url, locale, tags, status, metadata, created_at, updated_at`.trim();

export async function getPresentations(): Promise<Presentation[]> {
  try {
    const result = await withTenant(tenantSlugFromHost(""), (client) =>
      client.query<Presentation>(
        `SELECT ${PRESENTATION_SELECT_COLS} FROM presentation WHERE deleted_at IS NULL ORDER BY created_at DESC`
      )
    );
    return result.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPresentations", err);
  }
}

export async function getPresentationById(id: string): Promise<Presentation | null> {
  try {
    const result = await withTenant(tenantSlugFromHost(""), (client) =>
      client.query<Presentation>(
        `SELECT ${PRESENTATION_SELECT_COLS} FROM presentation WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      )
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPresentationById", err);
  }
}
