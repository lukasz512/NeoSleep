import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (pool !== null) return pool;
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") return null;
  try {
    pool = new Pool({ connectionString: url });
    return pool;
  } catch {
    return null;
  }
}
