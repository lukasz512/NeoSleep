import { test } from "node:test";
import assert from "node:assert/strict";
import { isHumanComment, isNoise, shortComment, slimIssue, splitSections } from "./linear-slim.mjs";

const issue = (overrides = {}) => ({
  identifier: "CORE-99",
  title: "Dev smoke test fails on every frontend-only merge",
  description: "## Problem\n\nSmoke waits for the wrong commit.\n\n## Change\n\nWait for the deployed one.\n\n## Done when\n\nGreen on a frontend merge.",
  priorityLabel: "High",
  createdAt: "2026-10-03T17:42:40.964Z",
  updatedAt: "2026-10-03T18:27:01.441Z",
  completedAt: "2026-10-03T18:27:01.429Z",
  canceledAt: null,
  state: { name: "Done", type: "completed" },
  labels: { nodes: [{ name: "Bug" }, { name: "ci-failed" }] },
  attachments: {
    nodes: [
      { title: "CORE-99 Smoke waits", url: "https://github.com/lukasz512/NeoSleep/pull/362" },
      { title: "Artifact: CORE-99 fixed", url: "https://claude.ai/artifact/GhSU" },
      { title: "dup", url: "https://github.com/lukasz512/NeoSleep/pull/362" },
    ],
  },
  comments: { nodes: [] },
  ...overrides,
});

test("keeps the core: key, title, sections, status, priority, links; drops pipeline labels", () => {
  const { item } = slimIssue(issue());
  assert.equal(item.team_key, "CORE");
  assert.equal(item.number, 99);
  assert.equal(item.problem, "Smoke waits for the wrong commit.");
  assert.equal(item.change, "Wait for the deployed one.");
  assert.equal(item.done_when, "Green on a frontend merge.");
  assert.equal(item.status, "done");
  assert.equal(item.priority, 2);
  assert.deepEqual(item.labels, ["Bug"]);
  assert.deepEqual(item.links.map((l) => l.kind), ["pr", "artifact"]);
  assert.equal(item.completed_at, "2026-10-03T18:27:01.429Z");
});

test("maps the old pipeline states onto the new flow", () => {
  assert.equal(slimIssue(issue({ state: { name: "Ready for Worker" } })).item.status, "to_spec");
  assert.equal(slimIssue(issue({ state: { name: "Todo" } })).item.status, "backlog");
  const blocked = slimIssue(issue({ state: { name: "Blocked" } })).item;
  assert.equal(blocked.status, "backlog");
  assert.ok(blocked.labels.includes("blocked"));
  const dup = slimIssue(issue({ state: { name: "Duplicate" } })).item;
  assert.equal(dup.status, "canceled");
  assert.ok(dup.labels.includes("duplicate"));
  assert.equal(slimIssue(issue({ state: { name: "Backlog" } })).item.completed_at, null);
});

test("a body without the three headings becomes the problem", () => {
  assert.deepEqual(splitSections("Just a note."), { problem: "Just a note.", change: null, done_when: null });
  assert.deepEqual(splitSections(null), { problem: null, change: null, done_when: null });
});

test("drops the agent's progress chatter", () => {
  for (const body of [
    "Work started on branch `worktree-neo-5`",
    "Implemented and pushed `worktree-x`.",
    "Built and pushed on `worktree-neo-218-oa-order-rec`",
    "Pushed `worktree-neo-51` (3 commits)",
    "<!-- ci-autofix -->\n## CI failed",
    "**Worker run complete — NEO-9**",
    "Environment pre-flight failed",
    "Artifact: https://claude.ai/artifact/abc",
  ]) {
    assert.ok(isNoise(body), body);
  }
  assert.ok(!isNoise("Decisions (Łukasz, form neo218-r1)"));
});

test("keeps decisions, Łukasz's own Polish comments and pwa-dev verification; drops other English chatter", () => {
  const { comments } = slimIssue(
    issue({
      comments: {
        nodes: [
          { body: "Work started on branch `x`", createdAt: "2026-10-01T00:00:00Z" },
          { body: "potrzebuje jeszcze raz artefakt, nie jest jasne", createdAt: "2026-10-03T00:00:00Z" },
          { body: "Decision D1 (Łukasz, 2026-09-28): quiet hours use the recipient's zone.", createdAt: "2026-10-02T00:00:00Z" },
          { body: "The side panel now renders on the right.", createdAt: "2026-10-02T01:00:00Z" },
          { body: "✅ Verified on pwa-dev after merge.", createdAt: "2026-10-04T00:00:00Z" },
        ],
      },
    }),
  );
  assert.deepEqual(
    comments.map((c) => c.body.split(" ")[0]),
    ["Decision", "potrzebuje", "✅"],
  );
});

// CORE-185 / CodeQL #48 #49: the link kind comes from the host, not from text anywhere in the URL.
test("a link is a PR/artifact only on github.com / claude.ai itself", () => {
  const { item } = slimIssue(
    issue({
      attachments: {
        nodes: [
          { url: "https://evil.test/?u=github.com/a/b/pull/1" },
          { url: "https://evil.test/claude.ai/artifact/x" },
          { url: "https://github.com/a/b/pull/2" },
        ],
      },
    }),
  );
  assert.deepEqual(item.links.map((l) => l.kind), ["other", "other", "pr"]);
});

test("an attribution '(Łukasz, …)' mid-comment still marks a decision", () => {
  const { comments } = slimIssue(
    issue({ comments: { nodes: [{ body: "Quiet hours use the recipient's zone (Łukasz, 2026-09-28).", createdAt: "2026-10-02T00:00:00Z" }] } }),
  );
  assert.equal(comments.length, 1);
});

test("a kept comment is at most 5 lines", () => {
  const body = ["Decisions:", "- a", "- b", "- c", "- d", "- e", "- f"].join("\n");
  const short = shortComment(body);
  assert.equal(short.split("\n").length, 6);
  assert.ok(short.endsWith("…"));
});

test("Polish detection needs two Polish function words", () => {
  assert.ok(isHumanComment("sprobuj jeszcze raz, prosze"));
  assert.ok(!isHumanComment("Pushed the branch to origin."));
});

test("a key that is not KEY-n is skipped", () => {
  assert.equal(slimIssue(issue({ identifier: "weird" })), null);
});
