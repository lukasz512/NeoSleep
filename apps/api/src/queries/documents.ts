import type { TenantContext } from "../context/TenantContext.js";
import { getFileAttachmentsForEntity, getFileAttachmentById, type FileAttachment } from "../db.js";
import { NotFoundError } from "../errors.js";
import { getPartnerDocumentSignedUrl } from "../services/partnerDocuments.js";

/**
 * QUERIES — signed documents (GDPR consent, partner agreement) attached to a
 * `users` row (entity_type='user'). Read-only. No writes, no audit log.
 */

export interface DocumentDto {
  id: string;
  documentType: string | null;
  filename: string | null;
  mimeType: string | null;
  signedAt: string;
}

function toDto(a: FileAttachment): DocumentDto {
  return {
    id: a.id,
    documentType: (a.metadata?.document_type as string | undefined) ?? null,
    filename: a.filename,
    mimeType: a.mime_type,
    signedAt: a.created_at.toISOString(),
  };
}

export async function GetUserDocumentsQuery(ctx: TenantContext, userId: string): Promise<DocumentDto[]> {
  const rows = await getFileAttachmentsForEntity(ctx.client, "user", userId);
  return rows.map(toDto);
}

/** Short-lived signed URL — never the raw storage path or credentials. */
export async function GetUserDocumentDownloadUrlQuery(
  ctx: TenantContext,
  userId: string,
  documentId: string
): Promise<string> {
  const attachment = await getFileAttachmentById(ctx.client, documentId);
  if (!attachment || attachment.entity_type !== "user" || attachment.entity_id !== userId || !attachment.path) {
    throw new NotFoundError("Document", documentId);
  }
  return getPartnerDocumentSignedUrl(attachment.path);
}
