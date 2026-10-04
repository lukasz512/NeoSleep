#!/usr/bin/env node
// ci-wait — wait for a branch HEAD's CI to finish without draining the GitHub API
// (CORE-128). `gh run watch` polls every 3 s (~40 calls a minute per session) and a few
// sessions doing that at once exhausted the 5000/h limit. This asks ci-status.mjs at
// most once a minute; ci-status shares its answer with every other session through
// the gh-cache, so N sessions waiting on CI cost about one call a minute in total.
// Run it in the background:
//
//   node infrastructure/scripts/ci-wait.mjs [--branch <b>] [--sha <sha>] [--max-minutes 45]
//     → prints the final ci-status JSON; exit 0 green, 1 red, 2 gave up (still pending)
//
// English only (CLAUDE.md). No dependencies beyond Node.

import { fileURLToPath } from "node:url";
import { ciStatus } from "./ci-status.mjs";

export const POLL_MS = 60_000;

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
  const status = await waitForCi({ check: () => ciStatus({ branch, sha }), maxMs });
  process.stdout.write(JSON.stringify(status) + "\n");
  process.exit(status.state === "success" ? 0 : status.state === "failure" ? 1 : 2);
}
