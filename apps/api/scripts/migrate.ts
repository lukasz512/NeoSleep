/**
 * Standalone migration runner — run with: pnpm --filter @neo/api migrate
 * Applies all pending .sql files from apps/api/migrations/ against DATABASE_URL.
 *
 * server.ts only calls runMigrations() on real startup (skipped under vitest,
 * see the `process.env.VITEST` guard there), so CI needs this to provision a
 * fresh ephemeral Postgres before running the integration tests.
 */
import { runMigrations } from "../src/db/migrations.js";

runMigrations()
  .then(() => {
    console.log("[migrate] all migrations applied");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
