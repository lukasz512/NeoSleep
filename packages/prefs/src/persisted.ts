/**
 * Vue layer over storage.ts: `usePersistedState(slot, defaults)` is a ref that
 * loads the signed-in user's saved value on this device and saves changes back
 * (debounced). The app says who is signed in with `setPrefsIdentity`; before
 * that nothing is read or written, and switching user reloads every mounted ref
 * from the new user's slot.
 */
import { ref, shallowRef, watch, getCurrentScope, onScopeDispose, type Ref } from "vue";
import { browserStorage, prefsKey, readPref, writePref, sanitize, type KeyValueStorage, type PrefsIdentity } from "./storage";

export const WRITE_DEBOUNCE_MS = 300;

const identity = shallowRef<PrefsIdentity | null>(null);

export function setPrefsIdentity(next: PrefsIdentity | null): void {
  const cur = identity.value;
  if (cur?.tenant === next?.tenant && cur?.userId === next?.userId) return;
  identity.value = next ? { tenant: next.tenant, userId: next.userId } : null;
}

export function getPrefsIdentity(): PrefsIdentity | null {
  return identity.value;
}

export interface PersistedStateOptions<T> {
  /** Runs on the raw stored value before shape checks — upgrade legacy formats here. */
  normalize?: (raw: unknown) => unknown;
  /** Runs after shape checks — drop values that no longer exist (e.g. a deleted territory). */
  validate?: (value: T) => T;
  /** Defaults to the browser's localStorage (null when blocked → defaults only, no errors). */
  storage?: KeyValueStorage | null;
}

export function usePersistedState<T>(slot: string, defaults: T, opts: PersistedStateOptions<T> = {}): Ref<T> {
  const storage = opts.storage === undefined ? browserStorage() : opts.storage;

  function load(): T {
    const id = identity.value;
    const raw = id ? readPref(storage, prefsKey(id, slot)) : undefined;
    const shaped = sanitize(opts.normalize ? opts.normalize(raw) : raw, defaults);
    return opts.validate ? opts.validate(shaped) : shaped;
  }

  const state = ref(load()) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingFor: PrefsIdentity | null = null;
  let loading = false;

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pendingFor) writePref(storage, prefsKey(pendingFor, slot), state.value);
    pendingFor = null;
  }

  function reload() {
    loading = true;
    state.value = load();
    // The deep watcher below fires after this tick; let it see `loading` first.
    queueMicrotask(() => (loading = false));
  }

  watch(
    state,
    () => {
      if (loading || !identity.value) return;
      pendingFor = identity.value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    { deep: true },
  );

  watch(identity, () => {
    // A change typed by the previous user belongs to their slot, not the next one's.
    flush();
    reload();
  });

  function onStorage(e: StorageEvent) {
    const id = identity.value;
    if (id && e.key === prefsKey(id, slot)) reload();
  }
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  if (getCurrentScope()) {
    onScopeDispose(() => {
      flush();
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    });
  }

  return state;
}
