import { Pool } from "pg";
import { DatabaseError } from "../errors.js";

let db: Pool | null = null;

export function getDb(): Pool {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new DatabaseError("getDb", new Error("DATABASE_URL is not set — cannot start without a database connection"));
  }
  db = new Pool({ connectionString: url });
  return db;
}
