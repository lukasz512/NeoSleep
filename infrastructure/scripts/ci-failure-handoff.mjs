#!/usr/bin/env node
// ci-failure-handoff — runs in GitHub Actions when CI goes red on a work branch
// (.github/workflows/ci-failure-handoff.yml, NEO-182). Tells whoever fixes it:
//   1. a comment on the branch's open PR with the failing tests (same text as below);
//   2. the same comment on the branch's board ticket (any team key in the branch name).
//      A nightly-worker branch (worker/*) still in `building` goes back to `approved`, and
//      the worker sees the `<!-- ci-autofix -->` comment and runs CI-fix mode; once
//      .claude/ci-autofix.json's maxFixAttempts is used up it goes to `needs_review` (a
//      human decides). A session branch (worktree-*) only gets the comment: the live
//      session's quality-gate.sh owns that fix loop. CORE-188: the board, not Linear.
//
// env: BRANCH, SHA, GITHUB_REPOSITORY, GH_TOKEN (gh CLI), BOARD_API_URL + BOARD_AGENT_TOKEN
// (optional — without them only the PR is told, with a workflow warning).
// English only (CLAUDE.md).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ciStatus, commentBody, RULES } from "./ci-status.mjs";
import { ticketFromBranch } from "../../.claude/skills/ship-artifact/ticket.mjs";

const warn = (msg) => console.log(`::warning::${msg}`);

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

/** What the handoff does to the ticket. The agent token may only move a `building` item. */
export function handoffPlan({ branch, status, exhausted }) {
  if (status !== "building") return { comment: true, move: null };
  if (exhausted) return { comment: true, move: RULES.board.exhaustedStatus };
  return { comment: true, move: branch.startsWith("worker/") ? RULES.board.workerStatus : null };
}

export async function tellBoard({ ticket, branch, body, exhausted, config, fetchImpl = fetch }) {
  const call = async (method, path, payload) => {
    const res = await fetchImpl(`${config.apiUrl.replace(/\/+$/, "")}/api/v1/platform/work${path}`, {
      method,
      headers: { "X-Agent-Token": config.agentToken, ...(payload ? { "Content-Type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`board ${method} ${path} → ${res.status}: ${json.error ?? "request failed"}`);
    return json;
  };
  const { item } = await call("GET", `/items/${ticket}`);
  const plan = handoffPlan({ branch, status: item.status, exhausted });
  await call("POST", `/items/${ticket}/comments`, { body });
  if (plan.move) await call("PATCH", `/items/${ticket}`, { status: plan.move });
  return `${ticket}: commented, → ${plan.move ?? `${item.status} (unchanged)`}`;
}

async function main() {
  const { BRANCH, SHA, GITHUB_REPOSITORY: REPO, BOARD_API_URL, BOARD_AGENT_TOKEN } = process.env;
  if (!BRANCH || !SHA || !REPO) throw new Error("BRANCH, SHA and GITHUB_REPOSITORY are required");
  const status = ciStatus({ branch: BRANCH, sha: SHA, repo: REPO });
  if (status.state !== "failure") {
    console.log(`CI for ${BRANCH}@${SHA.slice(0, 7)} is '${status.state}' now — nothing to hand off.`);
    return;
  }
  const body = commentBody(status);
  console.log(body);

  const prs = JSON.parse(gh(["pr", "list", "--repo", REPO, "--head", BRANCH, "--state", "open", "--json", "number"]));
  const ticket = ticketFromBranch(BRANCH);
  if (process.env.DRY_RUN) {
    console.log(`DRY_RUN: would comment on PR(s) ${prs.map((p) => `#${p.number}`).join(", ") || "(none)"} and ${ticket || "(no ticket)"}`);
    return;
  }
  for (const { number } of prs) gh(["pr", "comment", String(number), "--repo", REPO, "--body", body]);

  if (!ticket) return warn(`No ticket key in branch '${BRANCH}' — only the PR was told.`);
  if (!BOARD_API_URL || !BOARD_AGENT_TOKEN) return warn("BOARD_API_URL / BOARD_AGENT_TOKEN secrets are not set — the board ticket was not told, so the worker won't pick this up.");
  console.log(await tellBoard({ ticket, branch: BRANCH, body, exhausted: status.exhausted, config: { apiUrl: BOARD_API_URL, agentToken: BOARD_AGENT_TOKEN } }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
