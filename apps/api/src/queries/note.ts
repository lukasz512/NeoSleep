import type { TenantContext } from "../context/TenantContext.js";
import { getNotesForEntity, type Note } from "../db.js";
import { ValidationError } from "../errors.js";
import { NOTE_ENTITY_TYPES, type NoteEntityType } from "../db/note.js";

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

export async function GetNotesForEntityQuery(
  ctx: TenantContext,
  entityType: string,
  entityId: string
): Promise<NoteDto[]> {
  assertNoteEntityType(entityType);
  if (!entityId?.trim()) throw new ValidationError("entity_id is required");

  const rows = await getNotesForEntity(ctx.client, entityType, entityId);
  return rows.map(toDto);
}
