import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/**
 * Generic file references (FHIR-adjacent) — see the FILE ATTACHMENTS block in
 * 001_tenant_schema.sql. Used here for the signed GDPR/partner-agreement PDFs
 * generated during doctor-invite acceptance (entity_type='user').
 */

export interface FileAttachment {
  id: string;
  entity_type: string;
  entity_id: string;
  url: string;
  storage_provider: string;
  bucket: string | null;
  path: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  is_public: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface InsertFileAttachmentInput {
  entity_type: string;
  entity_id: string;
  url: string;
  storage_provider?: string;
  bucket?: string | null;
  path?: string | null;
  filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  is_public?: boolean;
  uploaded_by?: string | null;
  metadata?: Record<string, unknown> | null;
}

const FILE_ATTACHMENT_COLS =
  "id, entity_type, entity_id, url, storage_provider, bucket, path, filename, mime_type, size_bytes, is_public, metadata, created_at";

export async function insertFileAttachment(
  client: PoolClient,
  input: InsertFileAttachmentInput
): Promise<FileAttachment> {
  try {
    const r = await client.query<FileAttachment>(
      `INSERT INTO file_attachment
         (entity_type, entity_id, url, storage_provider, bucket, path, filename, mime_type, size_bytes, is_public, uploaded_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${FILE_ATTACHMENT_COLS}`,
      [
        input.entity_type,
        input.entity_id,
        input.url,
        input.storage_provider ?? "supabase",
        input.bucket ?? null,
        input.path ?? null,
        input.filename ?? null,
        input.mime_type ?? null,
        input.size_bytes ?? null,
        input.is_public ?? false,
        input.uploaded_by ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return r.rows[0]!;
  } catch (err) {
    throw new DatabaseError("insertFileAttachment", err);
  }
}

export async function getFileAttachmentsForEntity(
  client: PoolClient,
  entityType: string,
  entityId: string
): Promise<FileAttachment[]> {
  try {
    const r = await client.query<FileAttachment>(
      `SELECT ${FILE_ATTACHMENT_COLS} FROM file_attachment
       WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    return r.rows;
  } catch (err) {
    throw new DatabaseError("getFileAttachmentsForEntity", err);
  }
}

export async function getFileAttachmentById(client: PoolClient, id: string): Promise<FileAttachment | null> {
  try {
    const r = await client.query<FileAttachment>(
      `SELECT ${FILE_ATTACHMENT_COLS} FROM file_attachment WHERE id = $1`,
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("getFileAttachmentById", err);
  }
}

/** Hard delete — file_attachment has no deleted_at column. Leaves the underlying storage blob in place (cheap to orphan, not worth a synchronous storage call on the request path). */
export async function deleteFileAttachment(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`DELETE FROM file_attachment WHERE id = $1`, [id]);
  } catch (err) {
    throw new DatabaseError("deleteFileAttachment", err);
  }
}
