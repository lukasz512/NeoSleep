import type { TenantContext } from "../context/TenantContext.js";
import { insertFileAttachment, getFileAttachmentById, deleteFileAttachment, type FileAttachment } from "../db.js";
import { insertAuditLog } from "../db.js";
import { NotFoundError, ValidationError, PartnerServiceError, AppError } from "../errors.js";
import { uploadPartnerDocument } from "../services/partnerDocuments.js";

/**
 * COMMANDS — sleep_study file attachments (PDF results, manual upload).
 *
 * Only PDF is accepted for now — this is the "narazie ręcznie" first cut
 * (2026-09-02); a richer flow (device/lab webhook writing directly into
 * sleep_study.raw_results, multiple file types) is future work, not this.
 */

const MAX_FILENAME_LENGTH = 200;

export interface UploadSleepStudyAttachmentInput {
  sleepStudyId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export async function UploadSleepStudyAttachmentCommand(
  ctx: TenantContext,
  input: UploadSleepStudyAttachmentInput
): Promise<FileAttachment> {
  if (input.mimeType !== "application/pdf") {
    throw new ValidationError("Only PDF files are supported for sleep study attachments");
  }
  if (!input.bytes?.byteLength) {
    throw new ValidationError("Uploaded file is empty");
  }

  const safeFilename = (input.filename || "results.pdf").trim().slice(0, MAX_FILENAME_LENGTH);
  const path = `sleep-study/${input.sleepStudyId}/${Date.now()}-${safeFilename}`;

  let uploaded: Awaited<ReturnType<typeof uploadPartnerDocument>>;
  try {
    uploaded = await uploadPartnerDocument(path, input.bytes, input.mimeType);
  } catch (err) {
    // Rethrown as an AppError (not caught/rewrapped by withTenant's generic
    // DatabaseError — see db/tenant.ts) so the real cause (e.g. "Supabase
    // Storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    // reaches the frontend instead of an opaque "Database error: withTenant".
    // This is a storage/config failure, not a Postgres one.
    if (err instanceof AppError) throw err;
    throw new PartnerServiceError("supabase-storage", (err as Error)?.message ?? "upload failed", err);
  }

  const attachment = await insertFileAttachment(ctx.client, {
    entity_type: "sleep_study",
    entity_id: input.sleepStudyId,
    url: uploaded.path,
    storage_provider: "supabase",
    bucket: uploaded.bucket,
    path: uploaded.path,
    filename: safeFilename,
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
    is_public: false,
    uploaded_by: ctx.user.id,
    metadata: {},
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "FileAttachment",
    entity_id: attachment.id,
    entity_after: { for_entity_type: "sleep_study", for_entity_id: input.sleepStudyId, filename: safeFilename },
    request_id: ctx.requestId,
  });

  return attachment;
}

export async function DeleteSleepStudyAttachmentCommand(
  ctx: TenantContext,
  sleepStudyId: string,
  attachmentId: string
): Promise<void> {
  const attachment = await getFileAttachmentById(ctx.client, attachmentId);
  if (!attachment || attachment.entity_type !== "sleep_study" || attachment.entity_id !== sleepStudyId) {
    throw new NotFoundError("Attachment", attachmentId);
  }

  await deleteFileAttachment(ctx.client, attachmentId);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "delete",
    entity_type: "FileAttachment",
    entity_id: attachmentId,
    entity_before: { for_entity_type: "sleep_study", for_entity_id: sleepStudyId, filename: attachment.filename },
    request_id: ctx.requestId,
  });
}
