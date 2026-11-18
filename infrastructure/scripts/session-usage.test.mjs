// Where the tokens went (CORE-247). Run: node --test infrastructure/scripts/session-usage.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { addSession, contextBucket, emptyStats, gateReason, report, stepKind } from "./session-usage.mjs";

const call = (id, timestamp, tokens, tool) => ({
  type: "assistant",
  timestamp,
  message: { id, usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: tokens - 1 }, content: tool ? [{ type: "tool_use", ...tool }] : [] },
});
const bash = (command) => ({ name: "Bash", input: { command } });
const user = (timestamp, content, extra = {}) => ({ type: "user", timestamp, message: { content }, ...extra });

test("bash commands are named by what they do", () => {
  assert.equal(stepKind("Bash", { command: "node infrastructure/scripts/ci-wait.mjs --branch x" }), "CI wait/poll");
  assert.equal(stepKind("Bash", { command: "gh run list --branch x" }), "CI wait/poll");
  assert.equal(stepKind("Bash", { command: "node .claude/skills/ship-artifact/build.mjs render c.json" }), "artifact build");
  assert.equal(stepKind("Bash", { command: "git status" }), "git");
  assert.equal(stepKind("Bash", { command: "ls" }), "bash other");
});

test("other tools: screenshots, edits, publish, no tool at all", () => {
  assert.equal(stepKind("Read", { file_path: "/tmp/after.png" }), "screenshot read");
  assert.equal(stepKind("Read", { file_path: "/tmp/a.ts" }), "read");
  assert.equal(stepKind("Write", {}), "edit/write");
  assert.equal(stepKind("Artifact", {}), "artifact publish");
  assert.equal(stepKind(undefined), "reply");
});

test("gate blocks are sorted by what they waited for", () => {
  assert.equal(gateReason("Quality gate failed: CI is running on abc"), "CI pending / not started");
  assert.equal(gateReason("Quality gate failed: CI failed on abc"), "CI red");
  assert.equal(gateReason("Quality gate failed: merged but not verified on pwa-dev"), "dev verify");
  assert.equal(gateReason("Quality gate failed: something new"), "other");
});

test("context sizes fall into four buckets", () => {
  assert.deepEqual([10_000, 60_000, 120_000, 150_000].map(contextBucket), ["<60k", "60–115k", "115–150k", ">150k"]);
});

test("tokens after /ship-artifact starts are counted apart, one call per message id", () => {
  const stats = addSession(
    emptyStats(),
    [
      call("m1", "2026-11-10T10:00:00Z", 50_000, { name: "Edit", input: {} }),
      call("m2", "2026-11-10T10:01:00Z", 100_000, { name: "Skill", input: { skill: "ship-artifact" } }),
      call("m2", "2026-11-10T10:01:00Z", 100_000),
      call("m3", "2026-11-10T10:02:00Z", 50_000, bash("gh run watch 1")),
      user("2026-11-10T10:03:00Z", "Stop hook feedback: Quality gate failed: CI is running on abc"),
      user("2026-11-10T10:04:00Z", "summary", { isCompactSummary: true }),
    ],
    { since: "2026-11-09" }
  );
  assert.equal(stats.sessions, 1);
  assert.equal(stats.calls, 3);
  assert.equal(stats.tokens, 200_000);
  assert.equal(stats.shipTokens, 150_000);
  assert.deepEqual(stats.shipKinds["CI wait/poll"], { calls: 1, tokens: 50_000 });
  assert.deepEqual(stats.gate, { "CI pending / not started": 1 });
  assert.equal(stats.compactions, 1);
  assert.match(report(stats), /after \/ship-artifact starts: 75\.0% of tokens \(2 calls\)/);
});

test("an old session whose file was merely touched brings nothing in", () => {
  const stats = addSession(emptyStats(), [call("old", "2026-09-20T10:00:00Z", 200_000, bash("ls"))], { since: "2026-11-09" });
  assert.equal(stats.sessions, 0);
  assert.equal(stats.tokens, 0);
});

test("the window is half-open and subagent calls are left out", () => {
  const stats = addSession(
    emptyStats(),
    [
      call("in", "2026-11-10T10:00:00Z", 10, bash("ls")),
      call("late", "2026-11-12T10:00:00Z", 10, bash("ls")),
      { ...call("side", "2026-11-10T10:00:00Z", 10, bash("ls")), isSidechain: true },
    ],
    { since: "2026-11-09", until: "2026-11-12" }
  );
  assert.equal(stats.calls, 1);
});
