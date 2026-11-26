// gh-cache — one small JSON cache for GitHub API answers, shared by every worktree
// and every Claude session on this machine (CORE-128). Parallel sessions used to ask
// GitHub the same question every few seconds and ran the 5000/h per-user limit dry;
// now the first asker stores the answer and the rest read it. A rate-limit hit is
// stored too, as a cooldown everyone respects until GitHub would answer again.
//
// English only (CLAUDE.md). No dependencies beyond Node.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** Entries older than this are dropped on write, whatever their TTL. */
const PRUNE_AFTER_MS = 7 * 24 * 3_600_000;
/** How long everyone backs off after GitHub says "rate limit" without a reset time. */
export const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const COOLDOWN_KEY = "__rate_limit_cooldown__";

/** .claude/local of the main checkout — the one directory all worktrees share. */
export function defaultCachePath() {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const gitDir = isAbsolute(common) ? common : resolve(process.cwd(), common);
  return join(dirname(gitDir), ".claude", "local", "gh-cache.json");
}

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

/** Atomic write (tmp + rename): two sessions writing at once never leave half a file. */
function save(path, data, now) {
  const kept = Object.fromEntries(Object.entries(data).filter(([, e]) => now - (e?.at ?? 0) < PRUNE_AFTER_MS));
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(kept) + "\n");
  renameSync(tmp, path);
}

/** The cached value for `key` while it is younger than its TTL (null TTL = forever), else undefined. */
export function cacheGet(path, key, now = Date.now()) {
  const entry = load(path)[key];
  if (!entry) return undefined;
  if (entry.ttlMs !== null && now - entry.at >= entry.ttlMs) return undefined;
  return entry.value;
}

export function cacheSet(path, key, value, ttlMs, now = Date.now()) {
  const data = load(path);
  data[key] = { at: now, ttlMs, value };
  try {
    save(path, data, now);
  } catch {
    /* a cache that can't be written only costs an extra API call next time */
  }
}

/** True when a failed gh call was GitHub refusing for rate limiting (primary or secondary). */
export function isRateLimitError(err) {
  const text = `${err?.stderr ?? ""} ${err?.message ?? ""}`;
  return /rate limit|HTTP 429|abuse detection/i.test(text);
}

/** ISO time until which every session should leave the API alone, or null. */
export function rateLimitedUntil(path, now = Date.now()) {
  const until = cacheGet(path, COOLDOWN_KEY, now);
  return until && Date.parse(until) > now ? until : null;
}

export function noteRateLimit(path, now = Date.now(), cooldownMs = RATE_LIMIT_COOLDOWN_MS) {
  const until = new Date(now + cooldownMs).toISOString();
  cacheSet(path, COOLDOWN_KEY, until, cooldownMs, now);
  return until;
}
