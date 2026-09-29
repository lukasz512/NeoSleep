#!/usr/bin/env node
// ci-failure-handoff — runs in GitHub Actions when CI goes red on a work branch
// (.github/workflows/ci-failure-handoff.yml, NEO-182). Tells whoever fixes it:
//   1. a comment on the branch's open PR with the failing tests (same text as below);
//   2. on the branch's Linear ticket (NEO-<n> in the branch name): the same comment, and
//      the ticket goes to "Ready for Worker" with the `ci-failed` label so the nightly
//      linear-worker picks it up — or, once .claude/ci-autofix.json's maxFixAttempts is
//      used up, to "Needs Review" without the label (a human decides).
//
// env: BRANCH, SHA, GITHUB_REPOSITORY, GH_TOKEN (gh CLI), LINEAR_API_KEY (optional —
// without it only the PR is told, with a workflow warning).
// English only (CLAUDE.md).

import { execFileSync } from "node:child_process";
import { ciStatus, commentBody, RULES } from "./ci-status.mjs";

const { BRANCH, SHA, GITHUB_REPOSITORY: REPO, LINEAR_API_KEY } = process.env;
const warn = (msg) => console.log(`::warning::${msg}`);

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

async function linear(query, variables) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`Linear API: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data;
}

async function tellLinear(ticket, body, exhausted) {
  const { issue } = await linear(
    `query($id: String!, $label: String!) { issue(id: $id) {
       id labels { nodes { id name } }
       team { id states { nodes { id name } } labels(filter: { name: { eq: $label } }) { nodes { id } } }
     } }`,
    { id: ticket, label: RULES.linear.failedLabel },
  );
  if (!issue) return warn(`Linear ticket ${ticket} not found — only the PR was told.`);
  await linear(`mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }`, {
    issueId: issue.id,
    body,
  });

  const stateName = exhausted ? RULES.linear.exhaustedState : RULES.linear.workerState;
  const state = issue.team.states.nodes.find((s) => s.name === stateName);
  if (!state) warn(`Linear state '${stateName}' not found in ${ticket}'s team — status left as is.`);

  let labelId = issue.team.labels.nodes[0]?.id;
  if (!labelId && !exhausted) {
    const created = await linear(
      `mutation($name: String!, $teamId: String!) { issueLabelCreate(input: { name: $name, teamId: $teamId, color: "#e5484d" }) { issueLabel { id } } }`,
      { name: RULES.linear.failedLabel, teamId: issue.team.id },
    );
    labelId = created.issueLabelCreate.issueLabel.id;
  }
  const others = issue.labels.nodes.map((l) => l.id).filter((id) => id !== labelId);
  const labelIds = exhausted || !labelId ? others : [...others, labelId];
  await linear(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, {
    id: issue.id,
    input: { labelIds, ...(state ? { stateId: state.id } : {}) },
  });
  console.log(`${ticket}: commented, → ${state ? stateName : "(state unchanged)"}${exhausted ? "" : ` + label ${RULES.linear.failedLabel}`}`);
}

async function main() {
  if (!BRANCH || !SHA || !REPO) throw new Error("BRANCH, SHA and GITHUB_REPOSITORY are required");
  const status = ciStatus({ branch: BRANCH, sha: SHA, repo: REPO });
  if (status.state !== "failure") {
    console.log(`CI for ${BRANCH}@${SHA.slice(0, 7)} is '${status.state}' now — nothing to hand off.`);
    return;
  }
  const body = commentBody(status);
  console.log(body);

  const prs = JSON.parse(gh(["pr", "list", "--repo", REPO, "--head", BRANCH, "--state", "open", "--json", "number"]));
  const ticket = (BRANCH.match(/\bneo-\d+\b/i)?.[0] ?? "").toUpperCase();
  if (process.env.DRY_RUN) {
    console.log(`DRY_RUN: would comment on PR(s) ${prs.map((p) => `#${p.number}`).join(", ") || "(none)"} and ${ticket || "(no ticket)"} → ${status.exhausted ? RULES.linear.exhaustedState : RULES.linear.workerState}`);
    return;
  }
  for (const { number } of prs) gh(["pr", "comment", String(number), "--repo", REPO, "--body", body]);

  if (!ticket) return warn(`No NEO ticket in branch '${BRANCH}' — only the PR was told.`);
  if (!LINEAR_API_KEY) return warn("LINEAR_API_KEY secret is not set — the Linear ticket was not told, so the worker won't pick this up.");
  await tellLinear(ticket, body, status.exhausted);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
