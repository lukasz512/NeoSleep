import type { PoolClient } from "pg";
import { ConflictError } from "../errors.js";

/**
 * platform.document_content_version rows — see
 * apps/api/migrations/022_document_content_version.sql and
 * docs/stories/document-content-editor.md for the full design. Every
 * function here must be called with a PoolClient obtained from
 * db/tenant.ts's withPlatform() (a real transaction — insertDocumentContentVersion
 * is multi-statement and depends on the is_current flip + insert succeeding
 * or failing together), the same division of responsibility withTenant()
 * has with its own per-tenant query modules.
 */
export interface DocumentContentVersionRow {
  id: string;
  template_key: string;
  locale: string;
  content_html: string;
  version_number: number;
  is_current: boolean;
  created_by_user_id: string;
  created_by_name: string;
  created_by_email: string;
  created_by_tenant_slug: string;
  change_note: string | null;
  created_at: Date;
}

export interface InsertDocumentContentVersionInput {
  templateKey: string;
  locale: string;
  contentHtml: string;
  createdByUserId: string;
  createdByName: string;
  createdByEmail: string;
  createdByTenantSlug: string;
  changeNote?: string | null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "23505";
}

/**
 * Flips the previous is_current row to false, computes the next
 * version_number, and inserts the new current row — three statements, one
 * transaction (see withPlatform). The real safety net against a concurrent
 * save race isn't the SELECT MAX (which has its own race window) but the
 * migration's UNIQUE partial index on (template_key, locale) WHERE
 * is_current: the losing concurrent transaction's INSERT raises a Postgres
 * unique-violation (23505), which rolls back that entire transaction
 * (including its is_current flip) and surfaces here as a ConflictError —
 * never a silent inconsistent state.
 */
export async function insertDocumentContentVersion(
  client: PoolClient,
  input: InsertDocumentContentVersionInput
): Promise<DocumentContentVersionRow> {
  await client.query(
    `UPDATE platform.document_content_version
       SET is_current = false
     WHERE template_key = $1 AND locale = $2 AND is_current = true`,
    [input.templateKey, input.locale]
  );

  const { rows: maxRows } = await client.query<{ max: number | null }>(
    `SELECT MAX(version_number) AS max FROM platform.document_content_version WHERE template_key = $1 AND locale = $2`,
    [input.templateKey, input.locale]
  );
  const nextVersion = (maxRows[0]?.max ?? 0) + 1;

  try {
    const { rows } = await client.query<DocumentContentVersionRow>(
      `INSERT INTO platform.document_content_version
         (template_key, locale, content_html, version_number, is_current,
          created_by_user_id, created_by_name, created_by_email, created_by_tenant_slug, change_note)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.templateKey,
        input.locale,
        input.contentHtml,
        nextVersion,
        input.createdByUserId,
        input.createdByName,
        input.createdByEmail,
        input.createdByTenantSlug,
        input.changeNote ?? null,
      ]
    );
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `A newer version of "${input.templateKey}"/"${input.locale}" was just saved by someone else — reload and try again.`
      );
    }
    throw err;
  }
}

export async function getCurrentDocumentContentVersion(
  client: PoolClient,
  templateKey: string,
  locale: string
): Promise<DocumentContentVersionRow | null> {
  const { rows } = await client.query<DocumentContentVersionRow>(
    `SELECT * FROM platform.document_content_version WHERE template_key = $1 AND locale = $2 AND is_current = true`,
    [templateKey, locale]
  );
  return rows[0] ?? null;
}

export interface ListDocumentContentVersionsOptions {
  limit?: number;
  /** version_number cursor — returns versions strictly older than this, descending. */
  cursor?: number;
}

export async function listDocumentContentVersions(
  client: PoolClient,
  templateKey: string,
  locale: string,
  options: ListDocumentContentVersionsOptions = {}
): Promise<DocumentContentVersionRow[]> {
  const limit = Math.min(options.limit ?? 20, 100);
  if (options.cursor !== undefined) {
    const { rows } = await client.query<DocumentContentVersionRow>(
      `SELECT * FROM platform.document_content_version
        WHERE template_key = $1 AND locale = $2 AND version_number < $3
        ORDER BY version_number DESC LIMIT $4`,
      [templateKey, locale, options.cursor, limit]
    );
    return rows;
  }
  const { rows } = await client.query<DocumentContentVersionRow>(
    `SELECT * FROM platform.document_content_version
      WHERE template_key = $1 AND locale = $2
      ORDER BY version_number DESC LIMIT $3`,
    [templateKey, locale, limit]
  );
  return rows;
}

export async function getDocumentContentVersionById(
  client: PoolClient,
  id: string
): Promise<DocumentContentVersionRow | null> {
  const { rows } = await client.query<DocumentContentVersionRow>(
    `SELECT * FROM platform.document_content_version WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
