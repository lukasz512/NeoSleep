import type { TenantContext } from "../context/TenantContext.js";
import { insertNote, softDeleteNote, getNoteById } from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../errors.js";
import { assertNoteEntityType, type NoteDto } from "../queries/note.js";

/**
 * COMMANDS — Note domain.
 *
 * Each command validates, writes, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 */

export interface CreateNoteInput {
  entity_type: string;
  entity_id: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function CreateNoteCommand(ctx: TenantContext, input: CreateNoteInput): Promise<NoteDto> {
  assertNoteEntityType(input.entity_type);
  if (!input.entity_id?.trim()) throw new ValidationError("entity_id is required");
  const body = input.body?.trim() ?? "";
  if (!body) throw new ValidationError("body is required");

  // author_id always comes from the authenticated session — never client-supplied.
  const note = await insertNote(ctx.client, {
    entity_type: input.entity_type,
    entity_id: input.entity_id.trim(),
    author_id: ctx.user.id,
    body,
    metadata: input.metadata,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "Note",
    entity_id: note.id,
    entity_after: { for_entity_type: note.entity_type, for_entity_id: note.entity_id },
    request_id: ctx.requestId,
  });

  return note;
}

export async function DeleteNoteCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("note id is required");

  const note = await getNoteById(ctx.client, id);
  if (!note) throw new NotFoundError("Note", id);

  const isAuthor = note.author_id === ctx.user.id;
  const isAdmin = ctx.user.role === "admin";
  if (!isAuthor && !isAdmin) {
    throw new ForbiddenError("Only the note's author or an admin can delete it");
  }

  await softDeleteNote(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "delete",
    entity_type: "Note",
    entity_id: id,
    entity_before: { for_entity_type: note.entity_type, for_entity_id: note.entity_id },
    request_id: ctx.requestId,
  });
}
