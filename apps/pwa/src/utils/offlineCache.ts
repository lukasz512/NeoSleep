/**
 * IndexedDB-backed read cache — see docs/ADR-013-offline-read-cache.md.
 *
 * One database per (tenant, user) session, never shared across sessions.
 * Records are cached individually by id, never as a query result page — a
 * "page" has no stable identity to invalidate against, an individual record
 * does. Offline "recently viewed" is a client-side read over whatever ids
 * happen to be cached, not a replay of a server-side query.
 *
 * Write-only from a network response; never a source of truth while online.
 * Callers only read from here inside a fetch's `catch` (network failure),
 * never when the server responded (even with an error status).
 */
import { openDB, deleteDB, type IDBPDatabase } from "idb";

const CACHE_SCHEMA_VERSION = 1;

/**
 * Entities allowed in the offline cache. Values match the `view-id` used by
 * AppEntityList/useEntityList for each entity (LeadsView uses "leads", not
 * "lead"), so the list view and its detail view write to the same store.
 * `patient` is deliberately absent — GDPR Art. 9 special-category data
 * doesn't belong in unencrypted browser storage without an explicit decision
 * (see ADR-013). Adding it later is a one-line addition here plus a
 * `cacheable` prop flip, not a rearchitecture.
 */
export const CACHEABLE_ENTITIES = ["hcp", "hco", "leads", "users"] as const;
export type CacheableEntity = (typeof CACHEABLE_ENTITIES)[number];

interface CachedRecord {
  value: Record<string, unknown>;
  cachedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
let currentDbName: string | null = null;

function dbNameFor(tenant: string, userId: string): string {
  return `neocrm-cache-${tenant}-${userId}`;
}

/**
 * Opens the cache database for one session. Safe to call multiple times for
 * the same (tenant, userId) — returns the same open connection. Called from
 * stores/auth.ts once a session is confirmed.
 */
export function openCacheDb(tenant: string, userId: string): Promise<IDBPDatabase> {
  const name = dbNameFor(tenant, userId);
  if (dbPromise && currentDbName === name) return dbPromise;
  currentDbName = name;
  dbPromise = openDB(name, CACHE_SCHEMA_VERSION, {
    upgrade(db) {
      for (const entity of CACHEABLE_ENTITIES) {
        if (!db.objectStoreNames.contains(entity)) {
          db.createObjectStore(entity);
        }
      }
    },
  });
  return dbPromise;
}

async function closeCacheDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
  currentDbName = null;
}

/**
 * Deletes the current session's cache database outright. Called on logout /
 * tenant switch so a previous session's cached HCP/HCO/lead/user records
 * never surface to whoever uses the device next.
 */
export async function clearCacheDb(tenant: string, userId: string): Promise<void> {
  await closeCacheDb();
  await deleteDB(dbNameFor(tenant, userId));
}

/** True once a session's cache DB has been opened — a cheap guard for callers before reading/writing. */
export function isCacheDbOpen(): boolean {
  return dbPromise !== null;
}

export async function getCachedRecord(
  entity: CacheableEntity,
  id: string,
): Promise<Record<string, unknown> | null> {
  if (!dbPromise) return null;
  const db = await dbPromise;
  const record = (await db.get(entity, id)) as CachedRecord | undefined;
  return record?.value ?? null;
}

export async function listCachedRecords(entity: CacheableEntity): Promise<Record<string, unknown>[]> {
  if (!dbPromise) return [];
  const db = await dbPromise;
  const all = (await db.getAll(entity)) as CachedRecord[];
  return all.map((r) => r.value);
}

export async function upsertCachedRecord(
  entity: CacheableEntity,
  id: string,
  value: Record<string, unknown>,
): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.put(entity, { value, cachedAt: Date.now() } satisfies CachedRecord, id);
}

/** Bulk write for list responses. Records missing `idKey` are skipped — nothing stable to key them by. */
export async function upsertCachedRecords(
  entity: CacheableEntity,
  records: Record<string, unknown>[],
  idKey = "id",
): Promise<void> {
  if (!dbPromise || records.length === 0) return;
  const db = await dbPromise;
  const tx = db.transaction(entity, "readwrite");
  const now = Date.now();
  await Promise.all([
    ...records
      .filter((value) => value[idKey] != null)
      .map((value) =>
        tx.store.put({ value, cachedAt: now } satisfies CachedRecord, String(value[idKey])),
      ),
    tx.done,
  ]);
}
