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
 * - connectionTimeoutMillis: 5_000 → if no connection is available in 5s, fail fast instead of
 *                     queueing forever (prevents request pile-up under load).
 * - statement_timeout: 30_000 → kill any query running longer than 30s (runaway queries).
 * - application_name → visible in pg_stat_activity — identifies this pool in DB monitoring.
 */
export function getDb(): Pool {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new DatabaseError("getDb", new Error("DATABASE_URL is not set — cannot start without a database connection"));
  }
  db = new Pool({
    connectionString: url,
    max: 25,
    min: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    application_name: "neocrm-api",
  });

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
