/**
 * Generic offline read-cache store — one per cacheable entity via the
 * factory below, not five hand-copied stores. See docs/ADR-013.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  type CacheableEntity,
  getCachedRecord,
  listCachedRecords,
  upsertCachedRecord,
  upsertCachedRecords,
} from "../utils/offlineCache";

function createEntityCacheStore(entity: CacheableEntity) {
  return defineStore(`entityCache:${entity}`, () => {
    /** Set on every successful write-through; lets the UI show "last synced at …" when serving from cache. */
    const lastSyncedAt = ref<number | null>(null);

    async function cacheList(records: Record<string, unknown>[]): Promise<void> {
      await upsertCachedRecords(entity, records);
      lastSyncedAt.value = Date.now();
    }

    async function cacheOne(record: Record<string, unknown>): Promise<void> {
      const id = record.id;
      if (id == null) return;
      await upsertCachedRecord(entity, String(id), record);
      lastSyncedAt.value = Date.now();
    }

    function readList(): Promise<Record<string, unknown>[]> {
      return listCachedRecords(entity);
    }

    function readOne(id: string): Promise<Record<string, unknown> | null> {
      return getCachedRecord(entity, id);
    }

    return { lastSyncedAt, cacheList, cacheOne, readList, readOne };
  });
}

type EntityCacheStore = ReturnType<ReturnType<typeof createEntityCacheStore>>;
const storeDefinitions = new Map<CacheableEntity, ReturnType<typeof createEntityCacheStore>>();

/** Memoized so every caller for the same entity shares one Pinia store definition. */
export function useEntityCacheStore(entity: CacheableEntity): EntityCacheStore {
  let define = storeDefinitions.get(entity);
  if (!define) {
    define = createEntityCacheStore(entity);
    storeDefinitions.set(entity, define);
  }
  return define();
}
