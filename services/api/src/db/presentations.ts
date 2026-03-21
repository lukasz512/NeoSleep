import { getDb } from "./connection.js";
import { AppError, DatabaseError } from "../errors.js";

export interface Presentation {
  id: string;
  title: string;
  url: string;
  file_type: string;
  thumbnail_url: string | null;
  created_at: Date;
}

export async function getPresentations(): Promise<Presentation[]> {
  try {
    const result = await getDb().query<Presentation>(
      "SELECT id, title, url, file_type, thumbnail_url, created_at FROM tbl_presentations ORDER BY created_at DESC"
    );
    return result.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPresentations", err);
  }
}

export async function getPresentationById(id: string): Promise<Presentation | null> {
  try {
    const result = await getDb().query<Presentation>(
      "SELECT id, title, url, file_type, thumbnail_url, created_at FROM tbl_presentations WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPresentationById", err);
  }
}
