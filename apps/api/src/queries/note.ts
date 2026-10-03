import type { TenantContext } from "../context/TenantContext.js";
import { getNotesForEntity, type Note } from "../db.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { NOTE_ENTITY_TYPES, getRecentDeviceOrderComments, type DeviceOrderComment, type NoteEntityType } from "../db/note.js";
import { getViewer, requirePatientInScope, requirePractitionerInScope, requireOrganizationInScope } from "./entityAccess.js";
import { requireTreatmentPlanInScope } from "./treatmentPlan.js";
import { GetLeadByIdQuery } from "./lead.js";

/**
 * QUERIES — Note domain.
 *
 * Read-only. No writes, no audit log.
 */

export interface NoteDto {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(n: Note): NoteDto {
  return {
    id: n.id,
    entity_type: n.entity_type,
    entity_id: n.entity_id,
    author_id: n.author_id,
    author_name: n.author_name,
    body: n.body,
    metadata: n.metadata,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

export function assertNoteEntityType(entityType: string): asserts entityType is NoteEntityType {
  if (!NOTE_ENTITY_TYPES.includes(entityType as NoteEntityType)) {
    throw new ValidationError(`Invalid entity_type '${entityType}' — expected one of ${NOTE_ENTITY_TYPES.join(", ")}`);
  }
}

/**
 * A note is never more visible than the record it's on (CORE-104): reading or
 * writing notes reaches exactly as far as GET /<entity>/:id does. Doctors have
 * no lead access at all (leads routes exclude them).
 */
export async function requireNoteParentInScope(ctx: TenantContext, entityType: NoteEntityType, entityId: string): Promise<void> {
  switch (entityType) {
    case "patient":        await requirePatientInScope(ctx, entityId); return;
    case "treatment_plan": await requireTreatmentPlanInScope(ctx, entityId); return;
    case "practitioner":   await requirePractitionerInScope(ctx, entityId); return;
    case "organization":   await requireOrganizationInScope(ctx, entityId); return;
    case "lead": {
      const viewer = await getViewer(ctx);
      if (viewer.kind === "doctor" || !(await GetLeadByIdQuery(ctx, entityId))) throw new NotFoundError("Lead", entityId);
      return;
    }
  }
}

export async function GetNotesForEntityQuery(
  ctx: TenantContext,
  entityType: string,
  entityId: string
): Promise<NoteDto[]> {
  assertNoteEntityType(entityType);
  if (!entityId?.trim()) throw new ValidationError("entity_id is required");
  await requireNoteParentInScope(ctx, entityType, entityId);

  const rows = await getNotesForEntity(ctx.client, entityType, entityId);
  return rows.map(toDto);
}

export type DeviceOrderCommentDto = DeviceOrderComment;

/** NEO-217: latest comments on device orders across all patients — the admin Panel's overview. */
export async function GetRecentDeviceOrderCommentsQuery(
  ctx: TenantContext,
  input: { limit?: number }
): Promise<DeviceOrderCommentDto[]> {
  if (ctx.user.role !== "admin") throw new ForbiddenError("Only admins can see all device-order comments");
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 10), 1), 50);
  return getRecentDeviceOrderComments(ctx.client, limit);
}
