#!/usr/bin/env node
// ci-wait — wait for a branch HEAD's CI to finish without draining the GitHub API
// (CORE-128). `gh run watch` polls every 3 s (~40 calls a minute per session) and a few
// sessions doing that at once exhausted the 5000/h limit. This asks ci-status.mjs at
// most once a minute; ci-status shares its answer with every other session through
// the gh-cache, so N sessions waiting on CI cost about one call a minute in total.
// Run it in the background:
//
//   node infrastructure/scripts/ci-wait.mjs [--branch <b>] [--sha <sha>] [--max-minutes 45]
//     → prints the final ci-status JSON; exit 0 green, 1 red, 2 gave up (still pending),
//       3 another ci-wait already waits on this commit
//
// One wait per commit (CORE-247): it holds .claude/local/ci-wait/<sha>.pid while it runs.
// The quality gate reads that file and lets the turn end instead of blocking again, and
// a second ci-wait for the same commit exits at once.
//
// English only (CLAUDE.md). No dependencies beyond Node.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ciStatus } from "./ci-status.mjs";

export const POLL_MS = 60_000;

export const lockFile = (dir, sha) => join(dir, `${sha}.pid`);

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return err.code === "EPERM";
  }
}

function holder(file) {
  try {
    const pid = Number(readFileSync(file, "utf-8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    // benign: no lock file
    return null;
  }
}

/** Takes the lock unless a live process holds it. A stale or unreadable file is overwritten. */
export function acquireLock(file, { pid = process.pid, alive = isAlive } = {}) {
  const current = holder(file);
  if (current && current !== pid && alive(current)) return { ok: false, pid: current };
  writeFileSync(file, `${pid}\n`);
  return { ok: true };
}

/** Removes the lock only when this process still holds it. */
export function releaseLock(file, pid = process.pid) {
  if (holder(file) === pid) rmSync(file, { force: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls `check()` until the state is final. `wait` and `clock` are injectable for tests.
 * A rate-limit answer waits until GitHub's cooldown ends instead of retrying sooner.
 */
export async function waitForCi({ check, maxMs = 45 * 60_000, pollMs = POLL_MS, wait = sleep, clock = Date.now }) {
  const start = clock();
  for (;;) {
    const status = check();
    if (status.state === "success" || status.state === "failure") return status;
    const elapsed = clock() - start;
    if (elapsed >= maxMs) return status;
    const untilMs = status.state === "rate_limited" && status.until ? Date.parse(status.until) - clock() : 0;
    await wait(Math.min(Math.max(pollMs, untilMs), maxMs - elapsed));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const branch = arg("branch");
  const sha = arg("sha");
  const maxMs = Number(arg("max-minutes") ?? 45) * 60_000;
  const git = (...args) => execFileSync("git", args, { encoding: "utf-8" }).trim();
  const dir = join(git("rev-parse", "--show-toplevel"), ".claude/local/ci-wait");
  mkdirSync(dir, { recursive: true });
  const file = lockFile(dir, git("rev-parse", sha ?? "HEAD"));
  const lock = acquireLock(file);
  if (!lock.ok) {
    process.stdout.write(`already waiting on this commit (pid ${lock.pid}); you are re-invoked when it exits. Don't start another one.\n`);
    process.exit(3);
  }
  process.on("exit", () => releaseLock(file));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
  const status = await waitForCi({ check: () => ciStatus({ branch, sha }), maxMs });
  process.stdout.write(JSON.stringify(status) + "\n");
  process.exit(status.state === "success" ? 0 : status.state === "failure" ? 1 : 2);
}
