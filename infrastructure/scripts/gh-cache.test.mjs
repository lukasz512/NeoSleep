// node --test infrastructure/scripts/ — CORE-128: shared GitHub answer cache, rate-limit
// cooldown, and ci-wait's polling pace. No network: gh is a fake that counts its calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheGet, cacheSet, isRateLimitError, rateLimitedUntil, RATE_LIMIT_COOLDOWN_MS } from "./gh-cache.mjs";
import { ciStatus, PENDING_TTL_MS } from "./ci-status.mjs";
import { waitForCi, POLL_MS } from "./ci-wait.mjs";

const tmpCache = () => join(mkdtempSync(join(tmpdir(), "gh-cache-")), "gh-cache.json");
const T0 = Date.parse("2026-10-04T14:00:00Z");

function fakeGh(runs) {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(" "));
    return JSON.stringify(typeof runs === "function" ? runs() : runs);
  };
  return { gh, calls };
}

const run = (status, conclusion) => [{ databaseId: 7, headSha: "abc123", status, conclusion, url: "u/7", event: "push" }];
const status = (cachePath, gh, now = T0) => ciStatus({ branch: "b", sha: "abc123", gh, cachePath, now });

test("cache: a TTL entry expires, a null-TTL entry never does", () => {
  const path = tmpCache();
  cacheSet(path, "a", 1, 1000, T0);
  cacheSet(path, "b", 2, null, T0);
  assert.equal(cacheGet(path, "a", T0 + 999), 1);
  assert.equal(cacheGet(path, "a", T0 + 1000), undefined);
  assert.equal(cacheGet(path, "b", T0 + 6 * 24 * 3_600_000), 2);
});

test("ci-status: a green verdict is served from the cache — no second gh call", () => {
  const path = tmpCache();
  const { gh, calls } = fakeGh(run("completed", "success"));
  assert.equal(status(path, gh).state, "success");
  assert.equal(status(path, gh, T0 + 3_600_000).state, "success");
  assert.equal(calls.length, 1);
});

test("ci-status: a pending verdict is reused for a minute, then GitHub is asked again", () => {
  const path = tmpCache();
  let current = run("in_progress", "");
  const { gh, calls } = fakeGh(() => current);
  assert.equal(status(path, gh).state, "pending");
  current = run("completed", "success");
  assert.equal(status(path, gh, T0 + PENDING_TTL_MS - 1).state, "pending");
  assert.equal(calls.length, 1);
  assert.equal(status(path, gh, T0 + PENDING_TTL_MS).state, "success");
  assert.equal(calls.length, 2);
});

test("ci-status: a 403 rate limit becomes state rate_limited and a shared cooldown", () => {
  const path = tmpCache();
  const err = Object.assign(new Error("Command failed"), { stderr: "failed to get run: HTTP 403: API rate limit exceeded for user ID 1." });
  assert.equal(isRateLimitError(err), true);
  let calls = 0;
  const failing = () => {
    calls += 1;
    throw err;
  };
  const first = status(path, failing);
  assert.equal(first.state, "rate_limited");
  assert.equal(first.until, new Date(T0 + RATE_LIMIT_COOLDOWN_MS).toISOString());
  // Another session during the cooldown doesn't touch GitHub at all.
  const { gh, calls: otherCalls } = fakeGh(run("completed", "success"));
  assert.equal(ciStatus({ branch: "other", sha: "abc123", gh, cachePath: path, now: T0 + 60_000 }).state, "rate_limited");
  assert.equal(otherCalls.length, 0);
  assert.equal(calls, 1);
  assert.equal(rateLimitedUntil(path, T0 + RATE_LIMIT_COOLDOWN_MS), null);
});

test("ci-status: other gh errors still throw", () => {
  const boom = () => {
    throw Object.assign(new Error("Command failed"), { stderr: "HTTP 404: Not Found" });
  };
  assert.throws(() => status(tmpCache(), boom));
});

test("ci-wait: polls at most once a minute and stops on a final state", async () => {
  let clock = T0;
  const waits = [];
  const answers = ["pending", "pending", "success"];
  const result = await waitForCi({
    check: () => ({ state: answers.shift() }),
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    clock: () => clock,
  });
  assert.equal(result.state, "success");
  assert.deepEqual(waits, [POLL_MS, POLL_MS]);
});

test("ci-wait: a rate limit waits until the cooldown ends; gives up at the max", async () => {
  let clock = T0;
  const waits = [];
  const result = await waitForCi({
    check: () => ({ state: "rate_limited", until: new Date(clock + 5 * 60_000).toISOString() }),
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    clock: () => clock,
    maxMs: 12 * 60_000,
  });
  assert.equal(result.state, "rate_limited");
  assert.deepEqual(waits, [5 * 60_000, 5 * 60_000, 2 * 60_000]);
});
