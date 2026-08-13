/**
 * Rebuilds the isolated "test" tenant schema (used by integration tests, see
 * vitest.config.ts) as an exact structural clone of "neosleep" — schema only,
 * no data.
 *
 * create_tenant_schema() (migrations/001_tenant_schema.sql) alone is not
 * enough: several later migrations (004, 005, 006, 008, 009, 010, 011, 012)
 * alter tenant schemas outside that function, looping only over schemas
 * already registered in platform.tenants — so a schema provisioned by
 * calling create_tenant_schema() directly ends up structurally stale
 * (missing identities.region, lead.institution, etc.). Cloning the live
 * "neosleep" schema sidesteps that gap.
 *
 * Run after migrations change the schema — locally, and as a CI step right
 * after `pnpm --filter @neo/api migrate`:
 *
 *   pnpm --filter @neo/api exec tsx scripts/sync-test-schema.ts
 *
 * Requires the `pg_dump` client binary on PATH (matching the server's
 * Postgres major version).
 */
import { execFileSync } from "node:child_process";
import { Client } from "pg";

const SOURCE_SCHEMA = "neosleep";
const TARGET_SCHEMA = "test";

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) throw new Error("DATABASE_URL is not set");

  console.log(`[sync-test-schema] dumping schema "${SOURCE_SCHEMA}"...`);
  const dump = execFileSync(
    "pg_dump",
    [databaseUrl, "--schema-only", `--schema=${SOURCE_SCHEMA}`, "--no-owner", "--no-privileges"],
    { encoding: "utf-8", maxBuffer: 1024 * 1024 * 64 }
  );
  // Strip psql meta-commands (e.g. \restrict / \unrestrict, added by newer
  // pg_dump versions) — they aren't valid SQL when run through a plain `pg`
  // client instead of piping into psql.
  const sql = dump
    .split("\n")
    .filter((line) => !line.startsWith("\\"))
    .join("\n");
  const cloned = sql.split(SOURCE_SCHEMA).join(TARGET_SCHEMA);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.log(`[sync-test-schema] dropping schema "${TARGET_SCHEMA}" if it exists...`);
    await client.query(`DROP SCHEMA IF EXISTS "${TARGET_SCHEMA}" CASCADE`);
    console.log(`[sync-test-schema] applying cloned DDL as schema "${TARGET_SCHEMA}"...`);
    await client.query(cloned);
  } finally {
    await client.end();
  }

  console.log(`[sync-test-schema] done — "${TARGET_SCHEMA}" now mirrors "${SOURCE_SCHEMA}"`);
}

run().catch((err) => {
  console.error("[sync-test-schema] failed:", err);
  process.exit(1);
});
