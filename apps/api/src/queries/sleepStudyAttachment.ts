import type { TenantContext } from "../context/TenantContext.js";
import { getFileAttachmentsForEntity, getFileAttachmentById, type FileAttachment } from "../db.js";
import { NotFoundError } from "../errors.js";
import { getPartnerDocumentSignedUrl } from "../services/partnerDocuments.js";

/**
 * QUERIES — files attached to a sleep_study (PDF results, for now — manual
 * upload only, see commands/sleepStudyAttachment.ts). Read-only.
 *
 * Reuses services/partnerDocuments.ts's Supabase Storage helpers — despite
 * the file's name, uploadPartnerDocument/getPartnerDocumentSignedUrl are
 * generic (arbitrary path/bytes/contentType against one private bucket), not
 * partner-invite-specific. Needs SUPABASE_URL + SUPABASE_SERVICE_KEY set to
 * actually work (separate from DATABASE_URL) — same requirement the existing
 * GDPR-document upload already has.
 */

export interface SleepStudyAttachmentDto {
  id: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
}

function toDto(a: FileAttachment): SleepStudyAttachmentDto {
  return {
    id: a.id,
    filename: a.filename,
    mimeType: a.mime_type,
    sizeBytes: a.size_bytes,
    uploadedAt: a.created_at.toISOString(),
  };
}

export async function GetSleepStudyAttachmentsQuery(
  ctx: TenantContext,
  sleepStudyId: string
): Promise<SleepStudyAttachmentDto[]> {
  const rows = await getFileAttachmentsForEntity(ctx.client, "sleep_study", sleepStudyId);
  return rows.map(toDto);
}

/** Short-lived signed URL — never the raw storage path or credentials. */
export async function GetSleepStudyAttachmentDownloadUrlQuery(
  ctx: TenantContext,
  sleepStudyId: string,
  attachmentId: string
): Promise<string> {
  const attachment = await getFileAttachmentById(ctx.client, attachmentId);
  if (!attachment || attachment.entity_type !== "sleep_study" || attachment.entity_id !== sleepStudyId || !attachment.path) {
    throw new NotFoundError("Attachment", attachmentId);
  }
  return getPartnerDocumentSignedUrl(attachment.path);
}
