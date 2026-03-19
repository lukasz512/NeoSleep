import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { getDb } from "./connection.js";

/** Run all pending .sql migrations in order. Tracks applied files in schema_migrations. */
export async function runMigrations(): Promise<void> {
  const p = getDb();
  if (!p) return;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await p.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations WHERE filename = ANY($1::text[])",
      [files]
    );
    const done = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (done.has(file)) continue;
      console.log(`[migrations] applying ${file}...`);
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await p.query(sql);
      await p.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      console.log(`[migrations] ✓ ${file}`);
    }
  } catch (err) {
    console.error("[migrations] error:", err);
    throw err;
  }
}
