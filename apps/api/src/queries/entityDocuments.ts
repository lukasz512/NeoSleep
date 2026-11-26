import type { TenantContext } from "../context/TenantContext.js";
import { getFileAttachmentsForEntity, getFileAttachmentById, getLinkedUserIdForPractitioner } from "../db.js";
import { NotFoundError } from "../errors.js";
import { getPartnerDocumentSignedUrl } from "../services/partnerDocuments.js";
import { toDto, type DocumentDto } from "./documents.js";
import { requirePatientInScope, requirePractitionerInScope, requireOrganizationInScope } from "./entityAccess.js";

/**
 * QUERIES — "Documents" sub-tab on HCP/HCO/Patient detail views (Slice 1 of
 * docs/stories/documents-system-entity-integration.md). Read-only, plain
 * file_attachment reads — NOT filtered against
 * platform.document_template_entity_type (the Permissions-tab assignment):
 * existing signed documents don't carry a templateKey-matching
 * metadata.document_type today (see invitePractitioner.ts, which predates
 * DOCUMENT_MANIFEST), so a strict filter would hide real data. Wiring real
 * per-instance-to-template linkage is a later slice's work — see this
 * story's Slice 1 design-decision note.
 */

/**
 * A practitioner's own file_attachment rows (entity_type="practitioner",
 * currently always empty — no writer yet) merged with the linked doctor
 * user account's rows (entity_type="user") — see
 * db/practitioner.ts's getLinkedUserIdForPractitioner for why the merge is
 * necessary: the doctor's signed GDPR consent + partner agreement are
 * written against their users row, not their practitioner row.
 */
export async function GetPractitionerDocumentsQuery(ctx: TenantContext, practitionerId: string): Promise<DocumentDto[]> {
  await requirePractitionerInScope(ctx, practitionerId);
  const ownRows = await getFileAttachmentsForEntity(ctx.client, "practitioner", practitionerId);

  const linkedUserId = await getLinkedUserIdForPractitioner(ctx.client, practitionerId);
  const linkedUserRows = linkedUserId ? await getFileAttachmentsForEntity(ctx.client, "user", linkedUserId) : [];

  return [...ownRows, ...linkedUserRows]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .map(toDto);
}

export async function GetOrganizationDocumentsQuery(ctx: TenantContext, organizationId: string): Promise<DocumentDto[]> {
  await requireOrganizationInScope(ctx, organizationId);
  const rows = await getFileAttachmentsForEntity(ctx.client, "organization", organizationId);
  return rows.map(toDto);
}

export async function GetPatientDocumentsQuery(ctx: TenantContext, patientId: string): Promise<DocumentDto[]> {
  await requirePatientInScope(ctx, patientId);
  const rows = await getFileAttachmentsForEntity(ctx.client, "patient", patientId);
  return rows.map(toDto);
}

/**
 * Short-lived signed URL — never the raw storage path or credentials.
 * Ownership check accepts either entity_type="practitioner"/practitionerId
 * or entity_type="user"/the practitioner's linked user id, matching the
 * merge above.
 */
export async function GetPractitionerDocumentDownloadUrlQuery(
  ctx: TenantContext,
  practitionerId: string,
  documentId: string
): Promise<string> {
  await requirePractitionerInScope(ctx, practitionerId);
  const attachment = await getFileAttachmentById(ctx.client, documentId);
  if (!attachment || !attachment.path) throw new NotFoundError("Document", documentId);

  const ownsAsSelf = attachment.entity_type === "practitioner" && attachment.entity_id === practitionerId;
  const linkedUserId = ownsAsSelf ? null : await getLinkedUserIdForPractitioner(ctx.client, practitionerId);
  const ownsAsLinkedUser = attachment.entity_type === "user" && linkedUserId !== null && attachment.entity_id === linkedUserId;

  if (!ownsAsSelf && !ownsAsLinkedUser) throw new NotFoundError("Document", documentId);
  return getPartnerDocumentSignedUrl(attachment.path);
}

export async function GetOrganizationDocumentDownloadUrlQuery(
  ctx: TenantContext,
  organizationId: string,
  documentId: string
): Promise<string> {
  await requireOrganizationInScope(ctx, organizationId);
  const attachment = await getFileAttachmentById(ctx.client, documentId);
  if (!attachment || attachment.entity_type !== "organization" || attachment.entity_id !== organizationId || !attachment.path) {
    throw new NotFoundError("Document", documentId);
  }
  return getPartnerDocumentSignedUrl(attachment.path);
}

export async function GetPatientDocumentDownloadUrlQuery(
  ctx: TenantContext,
  patientId: string,
  documentId: string
): Promise<string> {
  await requirePatientInScope(ctx, patientId);
  const attachment = await getFileAttachmentById(ctx.client, documentId);
  if (!attachment || attachment.entity_type !== "patient" || attachment.entity_id !== patientId || !attachment.path) {
    throw new NotFoundError("Document", documentId);
  }
  return getPartnerDocumentSignedUrl(attachment.path);
}
