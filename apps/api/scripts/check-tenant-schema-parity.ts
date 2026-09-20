/**
 * Fails if create_tenant_schema() (migrations/001, most recently redefined
 * in 027_sync_create_tenant_schema.sql) has drifted from the live reference
 * tenant schema ("neosleep").
 *
 * This is the regression guard for the exact bug 027 fixed: 13+ migrations
 * (004-026) altered EXISTING tenant schemas via ad-hoc loops over
 * platform.tenants without ever updating this function's body, so a tenant
 * provisioned by calling it directly (onboard_new_client(), 000_platform.sql
 * — "Called by BFF endpoint POST /api/admin/clients") would silently get an
 * incomplete schema. Run this after every migration in CI (right after
 * `pnpm --filter @neo/api migrate`) so the next migration that touches a
 * tenant table but forgets to also update create_tenant_schema() fails fast
 * instead of drifting silently again.
 *
 * Provisions a throwaway schema via create_tenant_schema(), pg_dumps it
 * alongside the reference schema, normalizes the schema name out of both,
 * and diffs. Always drops the throwaway schema afterward, pass or fail.
 *
 *   pnpm --filter @neo/api exec tsx scripts/check-tenant-schema-parity.ts
 *
 * Requires the `pg_dump` client binary on PATH (matching the server's
 * Postgres major version) — same requirement as sync-test-schema.ts.
 */
import { execFileSync } from "node:child_process";
import { Client } from "pg";

const REFERENCE_SCHEMA = "neosleep";
const CHECK_SCHEMA = "schema_parity_check";

function dumpNormalized(databaseUrl: string, schema: string): string {
  const dump = execFileSync(
    "pg_dump",
    [databaseUrl, "--schema-only", `--schema=${schema}`, "--no-owner", "--no-privileges"],
    { encoding: "utf-8", maxBuffer: 1024 * 1024 * 64 }
  );

  // Same stripping as sync-test-schema.ts (psql meta-commands, and a PG17+
  // client preamble line an older server rejects), plus dropping comment
  // lines (they carry no structural info and their wording can vary).
  const lines = dump
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("\\") &&
        !line.startsWith("SET transaction_timeout") &&
        !line.startsWith("--")
    );

  // Normalize schema-qualification (dot) AND the historical "neosleep_"
  // naming-prefix on index/constraint names (underscore, no dot) — the
  // generator (027_sync_create_tenant_schema.sql) strips both entirely
  // rather than substituting them, so the reference dump must be normalized
  // the exact same way for an apples-to-apples comparison.
  const unqualify = (s: string) => s.split(`${schema}.`).join("").split(`${schema}_`).join("");

  // Group into blank-line-separated statement blocks and sort them — pg_dump
  // doesn't guarantee stable object ordering across two independent dumps
  // (observed directly: two structurally identical schemas emitted their
  // per-table constraints in different order), so a raw line-by-line diff
  // is flaky. Within a block, also sort its own lines (e.g. inline CHECK
  // constraints inside one CREATE TABLE can themselves swap order between
  // dumps) — comparing as an order-independent set, at both levels, is what
  // "did this drift" actually means here. Drop the schema-creation
  // statement itself; it's the one block whose text is never unqualified
  // (it's just the bare schema name), handled separately in the function
  // via format('CREATE SCHEMA IF NOT EXISTS %I', slug).
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) blocks.push(unqualify(current.join("\n")));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(unqualify(current.join("\n")));

  return blocks
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !/^CREATE SCHEMA\b/.test(b))
    .map((b) =>
      b
        .split("\n")
        // Strip a trailing comma before sorting: SQL omits it on whichever
        // item happens to be declared last, so after an alphabetical sort
        // that comma can end up on a different line than in the other
        // dump — cosmetic only, not a structural difference.
        .map((l) => l.trim().replace(/,$/, ""))
        .sort()
        .join("\n")
    )
    .sort()
    .join("\n\n");
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.log(`[check-tenant-schema-parity] dropping "${CHECK_SCHEMA}" if it exists...`);
    await client.query(`DROP SCHEMA IF EXISTS "${CHECK_SCHEMA}" CASCADE`);

    console.log(`[check-tenant-schema-parity] provisioning "${CHECK_SCHEMA}" via create_tenant_schema()...`);
    await client.query("SELECT create_tenant_schema($1)", [CHECK_SCHEMA]);

    console.log(`[check-tenant-schema-parity] dumping "${REFERENCE_SCHEMA}" and "${CHECK_SCHEMA}"...`);
    const reference = dumpNormalized(databaseUrl, REFERENCE_SCHEMA);
    const generated = dumpNormalized(databaseUrl, CHECK_SCHEMA);

    if (reference !== generated) {
      console.error(
        `[check-tenant-schema-parity] FAILED — create_tenant_schema() no longer matches "${REFERENCE_SCHEMA}".\n` +
          `A migration touched tenant-schema tables without updating create_tenant_schema() to match. ` +
          `Regenerate it (pg_dump --schema-only --schema=${REFERENCE_SCHEMA}, convert to the parameterized ` +
          `function — see 027_sync_create_tenant_schema.sql's header for the exact approach) and add a new migration.`
      );
      process.exit(1);
    }

    console.log("[check-tenant-schema-parity] OK — create_tenant_schema() matches the reference schema.");
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${CHECK_SCHEMA}" CASCADE`);
    await client.end();
  }
}

run().catch((err) => {
  console.error("[check-tenant-schema-parity] failed:", err);
  process.exit(1);
});
