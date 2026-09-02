import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import { isoDate } from "../routes/utils.js";

export const NOTE_ENTITY_TYPES = ["patient", "practitioner", "organization", "lead"] as const;
export type NoteEntityType = (typeof NOTE_ENTITY_TYPES)[number];

export interface Note {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string | null;
  /** Resolved via users -> identities (users has no first_name/last_name of its own). */
  author_name: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface InsertNoteInput {
  entity_type: string;
  entity_id: string;
  author_id: string;
  body: string;
  metadata?: Record<string, unknown>;
}

type NoteRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const NOTE_SELECT_COLS = `
  n.id, n.entity_type, n.entity_id, n.author_id, n.body, n.metadata,
  n.created_at, n.updated_at,
  ai.first_name AS author_first_name, ai.last_name AS author_last_name`.trim();

const NOTE_JOIN = `
  FROM note n
  LEFT JOIN users au ON n.author_id = au.id
  LEFT JOIN identities ai ON au.identity_id = ai.id`.trim();

function serialize(row: NoteRow): Note {
  const authorName = [row.author_first_name, row.author_last_name].filter(Boolean).join(" ").trim();
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    author_id: row.author_id,
    author_name: authorName || null,
    body: row.body,
    metadata: row.metadata,
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

export async function insertNote(client: PoolClient, data: InsertNoteInput): Promise<Note> {
  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO note (entity_type, entity_id, author_id, body, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        data.entity_type,
        data.entity_id,
        data.author_id,
        data.body,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
    const id = result.rows[0]!.id;
    const row = await getNoteById(client, id);
    if (!row) throw new DatabaseError("insertNote", new Error("Insert returned no rows"));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertNote", err);
  }
}

export async function getNoteById(client: PoolClient, id: string): Promise<Note | null> {
  try {
    const result = await client.query<NoteRow>(
      `SELECT ${NOTE_SELECT_COLS} ${NOTE_JOIN} WHERE n.id = $1 AND n.deleted_at IS NULL`,
      [id]
    );
    if (!result.rows[0]) return null;
    return serialize(result.rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getNoteById", err);
  }
}

export async function getNotesForEntity(
  client: PoolClient,
  entityType: string,
  entityId: string
): Promise<Note[]> {
  try {
    const result = await client.query<NoteRow>(
      `SELECT ${NOTE_SELECT_COLS} ${NOTE_JOIN}
       WHERE n.entity_type = $1 AND n.entity_id = $2 AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC`,
      [entityType, entityId]
    );
    return result.rows.map(serialize);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getNotesForEntity", err);
  }
}

export async function softDeleteNote(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE note SET deleted_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("softDeleteNote", err);
  }
}
