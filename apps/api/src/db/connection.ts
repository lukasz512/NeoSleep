import { Pool } from "pg";
import { DatabaseError } from "../errors.js";

let db: Pool | null = null;

/**
 * The connection pool manages a shared set of PostgreSQL connections reused across requests.
 *
 * WHY A POOL?
 * Opening a new DB connection on every HTTP request takes ~20-100ms and costs memory on the
 * Postgres server. A pool keeps N connections open and ready. When a request arrives, it borrows
 * a connection, uses it, then returns it — like a fleet of taxis vs. calling a car factory each time.
 *
 * SETTINGS EXPLAINED:
 * - max: 25         → at most 25 simultaneous connections. Each active HTTP request holds 1.
 *                     50 tenants × 1 rep each = 50 connections max, but not all are simultaneous.
 *                     Postgres default max_connections is usually 100 — we leave headroom for
 *                     background jobs, migrations, and admin queries.
 * - min: 2          → keep 2 connections alive even when idle (warm pool = faster cold starts).
 * - idleTimeoutMillis: 30_000  → release a connection after 30s of inactivity.
 * - connectionTimeoutMillis: 15_000 → if no connection is available in 15s, fail fast instead of
 *                     queueing forever (prevents request pile-up under load). Supabase's pooler
 *                     can take several seconds to wake up after being idle, so this is longer
 *                     than the usual "fail fast" default — see runMigrationsWithRetry() in
 *                     server.ts for the retry that covers cold starts on top of this.
 * - statement_timeout: 30_000 → kill any query running longer than 30s (runaway queries).
 * - application_name → visible in pg_stat_activity — identifies this pool in DB monitoring.
 */
/**
 * Pool size override (DB_POOL_MAX). Several deployments share one Supabase pooler (Cloud Run
 * dev + prod, Render during the NEO-45 transition), so each Cloud Run service runs with a
 * smaller pool than the local/Render default of 25.
 */
function poolMax(): number {
  const n = Number.parseInt(process.env.DB_POOL_MAX ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : 25;
}

function createPool(url: string, max: number, min: number): Pool {
  return new Pool({
    connectionString: url,
    max,
    min,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
    application_name: "neocrm-api",
  });
}

/**
 * A one-connection pool on DATABASE_URL (session mode) for work that needs a session: the
 * migration runner's pg_advisory_lock lives as long as its connection, which a transaction
 * pooler would hand to someone else mid-run. The caller must end() it.
 */
export function createSessionPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new DatabaseError("createSessionPool", new Error("DATABASE_URL is not set"));
  }
  const pool = createPool(url, 1, 0);
  pool.on("error", (err) => console.error("[session-pool] idle client error:", err.message));
  return pool;
}

/**
 * Runtime queries use DATABASE_POOL_URL (Supabase transaction pooler, port 6543, CORE-266)
 * when it is set: a request then holds a server connection only while its transaction runs,
 * so the 15-slot session pooler can no longer be exhausted (prod outage 2026-11-16).
 * Without it the runtime falls back to DATABASE_URL (session mode), as before. Runtime SQL
 * is transaction-safe: tenant scoping uses SET LOCAL and the advisory locks are
 * pg_advisory_xact_lock. Only the migration runner needs a session (createSessionPool).
 */
export function getDb(): Pool {
  if (db) return db;
  const url = process.env.DATABASE_POOL_URL?.trim() || process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new DatabaseError("getDb", new Error("DATABASE_URL is not set — cannot start without a database connection"));
  }
  db = createPool(url, poolMax(), 2);

  // Pool-level error handler — REQUIRED in Node 15+.
  // Without this, a connection-level error (e.g. Postgres restarted) becomes an
  // unhandledRejection and crashes the process.
  db.on("error", (err) => {
    console.error("[pool] idle client error:", err.message);
    // Write to platform.errors if/when that module is available.
    // Do NOT crash — the pool will remove the bad client automatically.
  });

  return db;
}
