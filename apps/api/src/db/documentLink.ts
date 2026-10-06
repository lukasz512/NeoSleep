import type { PoolClient } from "pg";

/**
 * NEO-258 (migration 056): an emailed link to one stored document — the
 * Historia clínica the doctor signed. The token is the only credential and
 * is stored hashed; a link is usable until it expires.
 */
export interface DocumentLink {
  id: string;
  patient_id: string;
  file_attachment_id: string;
  document_key: string;
  expires_at: Date;
  created_by: string | null;
  opened_at: Date | null;
  open_count: number;
  created_at: Date;
}

const COLS = "id, patient_id, file_attachment_id, document_key, expires_at, created_by, opened_at, open_count, created_at";

export async function insertDocumentLink(
  client: PoolClient,
  input: { patient_id: string; file_attachment_id: string; document_key: string; token_hash: string; expires_at: Date; created_by: string | null }
): Promise<DocumentLink> {
  const { rows } = await client.query<DocumentLink>(
    `INSERT INTO document_link (patient_id, file_attachment_id, document_key, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLS}`,
    [input.patient_id, input.file_attachment_id, input.document_key, input.token_hash, input.expires_at, input.created_by]
  );
  return rows[0]!;
}

/** The link behind a token hash, or null when unknown or expired — the caller can't tell which. */
export async function getUsableDocumentLinkByHash(client: PoolClient, tokenHash: string): Promise<DocumentLink | null> {
  const { rows } = await client.query<DocumentLink>(
    `SELECT ${COLS} FROM document_link WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function markDocumentLinkOpened(client: PoolClient, id: string): Promise<void> {
  await client.query(`UPDATE document_link SET opened_at = COALESCE(opened_at, now()), open_count = open_count + 1 WHERE id = $1`, [id]);
}
