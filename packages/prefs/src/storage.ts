/**
 * Per-user, per-device UI preferences in localStorage (CORE-45). Framework-free:
 * keys, envelopes, expiry and shape checks. The Vue layer is persisted.ts.
 *
 * Key: `neo:v1:{tenant}:{userId}:{slot}` — one entry per slot (e.g. one list's
 * filters), so two tabs or two lists never overwrite each other's blob, and a
 * second account on the same device never sees the first one's settings.
 * Stored as `{ v: <value>, at: <last write ms> }`; entries unused for 90 days are
 * forgotten so a shared device doesn't collect settings of people long gone.
 */

export const PREFS_PREFIX = "neo:v1:";
export const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface PrefsIdentity {
  tenant: string;
  userId: string;
}

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

interface Envelope {
  v: unknown;
  at: number;
}

export function prefsKey(id: PrefsIdentity, slot: string): string {
  return `${PREFS_PREFIX}${id.tenant}:${id.userId}:${slot}`;
}

/** The browser's localStorage, or null when it's missing or blocked (private mode, sandbox). */
export function browserStorage(): KeyValueStorage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${PREFS_PREFIX}probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function readEnvelope(storage: KeyValueStorage, key: string): Envelope | undefined {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("v" in parsed) || typeof (parsed as Envelope).at !== "number") return undefined;
    return parsed as Envelope;
  } catch {
    return undefined;
  }
}

/** Stored value, or undefined when missing, malformed or older than `maxAgeMs` (then it's removed). */
export function readPref(storage: KeyValueStorage | null, key: string, now = Date.now(), maxAgeMs = MAX_AGE_MS): unknown {
  if (!storage) return undefined;
  const env = readEnvelope(storage, key);
  if (!env) return undefined;
  if (now - env.at > maxAgeMs) {
    removePref(storage, key);
    return undefined;
  }
  return env.v;
}

/** False when there's no storage or the browser refused the write (quota, blocked) — never throws. */
export function writePref(storage: KeyValueStorage | null, key: string, value: unknown, now = Date.now()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ v: value, at: now } satisfies Envelope));
    return true;
  } catch {
    return false;
  }
}

export function removePref(storage: KeyValueStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // benign: blocked storage — nothing to remove.
  }
}

/** Removes every expired `neo:v1:` entry on this device, whoever it belongs to. Returns how many. */
export function pruneExpired(storage: KeyValueStorage | null, now = Date.now(), maxAgeMs = MAX_AGE_MS): number {
  if (!storage) return 0;
  const expired: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PREFS_PREFIX)) continue;
    const env = readEnvelope(storage, key);
    if (env && now - env.at > maxAgeMs) expired.push(key);
  }
  expired.forEach((key) => removePref(storage, key));
  return expired.length;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function matches(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) return Array.isArray(value);
  if (isPlainObject(template)) {
    return isPlainObject(value) && Object.keys(template).every((k) => matches(value[k], template[k]));
  }
  if (typeof template === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === typeof template;
}

/**
 * `value` reshaped to `defaults`: only the defaults' keys, each of the same type,
 * otherwise the default. Array items must match the default's first item (or be
 * strings when the default array is empty); bad items are dropped one by one.
 * Stored data is never trusted — an old build or a hand-edited entry can't break a list.
 */
export function sanitize<T>(value: unknown, defaults: T): T {
  if (Array.isArray(defaults)) {
    if (!Array.isArray(value)) return structuredClone(defaults);
    const item: unknown = defaults.length ? defaults[0] : "";
    const kept = value.filter((v) => matches(v, item)).map((v) => sanitize(v, item));
    // Nothing usable left of a non-empty list (e.g. a sort from an old build) → the default, not [].
    return (kept.length || !value.length ? kept : structuredClone(defaults)) as T;
  }
  if (isPlainObject(defaults)) {
    const src = isPlainObject(value) ? value : {};
    const out: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(defaults)) {
      out[k] = k in src && matches(src[k], d) ? sanitize(src[k], d) : structuredClone(d);
    }
    return out as T;
  }
  return matches(value, defaults) ? (value as T) : defaults;
}
