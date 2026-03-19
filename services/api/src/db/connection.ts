import { Pool } from "pg";

let db: Pool | null = null;

export function getDb(): Pool | null {
  if (db !== null) return db;
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") return null;
  try {
    db = new Pool({ connectionString: url });
    return db;
  } catch {
    return null;
  }
}
