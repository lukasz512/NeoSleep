#!/usr/bin/env node
// ci-status — the CI verdict for one branch HEAD, shared by every CI fix loop
// (NEO-182): the session's Stop hook (quality-gate.sh), the GitHub handoff
// (ci-failure-handoff.mjs) and the nightly linear-worker. Rules come from
// .claude/ci-autofix.json. Needs the `gh` CLI (authenticated, or GH_TOKEN).
//
//   node infrastructure/scripts/ci-status.mjs [--branch <b>] [--sha <sha>] [--repo owner/name]
//     → prints JSON: { state: none|pending|success|failure, runId, runUrl, failures[],
//        failedSteps[], failedRuns, maxFixAttempts, exhausted, allowedFixScope }
//   … --comment   → prints the markdown comment (PR + Linear use the same text)
//
// English only (CLAUDE.md). No dependencies beyond Node.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RULES = JSON.parse(readFileSync(join(HERE, "../../.claude/ci-autofix.json"), "utf-8"));

const MAX_FAILURES = 30;
// ANSI colour codes and GitHub's "<job>\t<step>\t<timestamp> " log prefix.
const ANSI = /\x1b\[[0-9;]*m/g;
const LOG_PREFIX = /^[^\t]*\t[^\t]*\t\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;

/**
 * Failing test names out of `gh run view --log-failed` text: Playwright's
 * end-of-run list ("[webkit] › e2e/x.spec.ts:57:3 › title") and Vitest's
 * "FAIL  src/x.spec.ts > suite > test" lines. Deduplicated, capped.
 */
export function parseFailures(log) {
  const out = new Set();
  let inPlaywrightList = false;
  for (const raw of log.split("\n")) {
    const line = raw.replace(ANSI, "").replace(LOG_PREFIX, "").replace(/^##\[\w+\]/, "");
    if (/^\s*\d+ failed\s*$/.test(line)) { inPlaywrightList = true; continue; }
    if (inPlaywrightList) {
      const m = /^\s+(\[[a-z]+\] › .+?)\s*$/.exec(line);
      if (m) { out.add(m[1]); continue; }
      if (/^\s*\d+ (flaky|skipped|passed|did not run)/.test(line) || line.trim() === "") inPlaywrightList = false;
    }
    const v = /^\s*(?:FAIL|×)\s+(\S+\.(?:spec|test)\.[cm]?[jt]sx?.*?)\s*(?:\d+ms)?$/.exec(line);
    if (v) out.add(v[1].replace(/\s+\[.*?\]$/, ""));
  }
  return [...out].slice(0, MAX_FAILURES);
}

/**
 * The verdict for `sha` from the branch's CI runs (newest first, as gh lists
 * them). Cancelled runs are ignored (a newer push of the same branch cancels
 * the older one), and so are skipped ones. `failedRuns` counts distinct
 * commits whose CI went red: the first red is the original push, every one
 * after it a failed fix attempt, so the loop is exhausted once
 * failedRuns > maxFixAttempts.
 */
export function verdict(runs, sha, maxFixAttempts = RULES.maxFixAttempts) {
  const live = runs.filter((r) => r.conclusion !== "cancelled" && r.conclusion !== "skipped");
  const forSha = live.filter((r) => r.headSha.startsWith(sha));
  const failedShas = new Set(live.filter((r) => r.status === "completed" && r.conclusion === "failure").map((r) => r.headSha));
  // Every live run on the commit counts (CORE-98): a red push run is not hidden by
  // a newer green twin — e.g. the PR run whose jobs ci.yml skips for work branches.
  const failed = forSha.find((r) => r.status === "completed" && r.conclusion !== "success");
  const latest = failed ?? forSha[0];
  let state = "none";
  if (failed) state = "failure";
  else if (forSha.some((r) => r.status !== "completed")) state = "pending";
  else if (latest) state = "success";
  const failedRuns = failedShas.size;
  return {
    state,
    runId: latest?.databaseId ?? null,
    runUrl: latest?.url ?? null,
    failedRuns,
    maxFixAttempts,
    exhausted: state === "failure" && failedRuns > maxFixAttempts,
  };
}

export function commentBody(status) {
  const lines = [RULES.commentMarker, `### CI failed on \`${status.branch}\` @ ${status.sha.slice(0, 7)}`];
  lines.push("", `Run: ${status.runUrl}`);
  if (status.failures.length) {
    lines.push("", "**Failing tests**", ...status.failures.map((f) => `- \`${f}\``));
  } else if (status.failedSteps.length) {
    lines.push("", "**Failing steps**", ...status.failedSteps.map((s) => `- ${s}`));
  }
  const attempt = Math.max(0, status.failedRuns - 1);
  if (status.exhausted) {
    lines.push("", `Stopped: still red after ${attempt} fix attempt(s) (limit ${status.maxFixAttempts}). Needs Łukasz.`);
  } else {
    lines.push("", `Fix attempt ${attempt + 1} of ${status.maxFixAttempts} — scope: ${RULES.allowedFixScope}`);
  }
  return lines.join("\n");
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export function ciStatus({ branch, sha, repo } = {}) {
  branch ??= git(["rev-parse", "--abbrev-ref", "HEAD"]);
  sha ??= git(["rev-parse", "HEAD"]);
  const repoArgs = repo ? ["--repo", repo] : [];
  const runs = JSON.parse(
    gh(["run", "list", ...repoArgs, "--workflow", RULES.workflow, "--branch", branch, "--limit", "40",
      "--json", "databaseId,headSha,status,conclusion,url,event"]),
  );
  const v = verdict(runs, sha);
  let failures = [];
  let failedSteps = [];
  if (v.state === "failure" && v.runId) {
    try {
      failures = parseFailures(gh(["run", "view", String(v.runId), ...repoArgs, "--log-failed"]));
    } catch { /* logs can lag a few seconds behind the conclusion */ }
    try {
      const jobs = JSON.parse(gh(["run", "view", String(v.runId), ...repoArgs, "--json", "jobs"])).jobs ?? [];
      failedSteps = jobs.flatMap((j) => (j.steps ?? []).filter((s) => s.conclusion === "failure").map((s) => `${j.name} › ${s.name}`));
    } catch { /* same */ }
  }
  return { branch, sha, ...v, failures, failedSteps, allowedFixScope: RULES.allowedFixScope };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const status = ciStatus({ branch: arg("branch"), sha: arg("sha"), repo: arg("repo") });
  process.stdout.write(process.argv.includes("--comment") ? commentBody(status) + "\n" : JSON.stringify(status) + "\n");
}
