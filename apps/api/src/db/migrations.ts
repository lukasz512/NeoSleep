import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { getDb } from "./connection.js";

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

/**
 * Arbitrary constant key for pg_advisory_lock. Several API deployments share one database
 * (Cloud Run dev + prod, Render during the NEO-45 transition) and each runs migrations on
 * startup — without a lock two of them starting together could both apply the same file.
 */
const MIGRATIONS_LOCK_KEY = 4_512_045;

/**
 * Run all pending .sql migrations in order. Tracks applied files in schema_migrations.
 *
 * Holds a session-level advisory lock for the whole run, so concurrent callers queue behind
 * each other and the later one sees the files already recorded. Each file and its
 * schema_migrations row commit in one transaction, so a crash can never leave a migration
 * applied but unrecorded (which would re-run it on the next start).
 */
export async function runMigrations(migrationsDir: string = DEFAULT_MIGRATIONS_DIR): Promise<void> {
  const client = await getDb().connect();
  let hadError = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATIONS_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations WHERE filename = ANY($1::text[])",
      [files]
    );
    const done = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (done.has(file)) continue;
      console.log(`[migrations] applying ${file}...`);
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      }
      console.log(`[migrations] ✓ ${file}`);
    }
  } catch (err) {
    hadError = true;
    console.error("[migrations] error:", err);
    throw err;
  } finally {
    // Releasing with hadError destroys the connection, which also drops the session lock —
    // same pattern as withTenant() (a broken connection must never go back into the pool).
    if (!hadError) await client.query("SELECT pg_advisory_unlock($1)", [MIGRATIONS_LOCK_KEY]).catch(() => undefined);
    client.release(hadError);
  }
}
