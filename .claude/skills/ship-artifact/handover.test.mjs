// Before/after on the board card (CORE-247). Run: node --test .claude/skills/ship-artifact/handover.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { beforeAfterLines, lightComment, normalizeBeforeAfter, renderWarning } from "./handover.mjs";

test("a full beforeAfter table is used as it is", () => {
  const beforeAfter = { rows: [["Save", "grey", "blue"]] };
  assert.equal(normalizeBeforeAfter({ beforeAfter }), beforeAfter);
});

test("before + after is the shorthand for one changed element", () => {
  assert.deepEqual(normalizeBeforeAfter({ before: "polls CI", after: "one wait" }), { rows: [["Change", "polls CI", "one wait"]] });
});

test("added describes a new element", () => {
  assert.deepEqual(normalizeBeforeAfter({ added: "usage report" }), { columns: ["New"], rows: [["usage report"]] });
});

test("no before/after at all is null, so the caller can refuse", () => {
  assert.equal(normalizeBeforeAfter({ before: "only one side" }), null);
  assert.equal(normalizeBeforeAfter({ beforeAfter: { rows: [] } }), null);
  assert.equal(normalizeBeforeAfter(), null);
});

test("rows become plain-text lines: html stripped, object cells read by their text", () => {
  const lines = beforeAfterLines({ rows: [["Save button", "<b>grey</b>", { text: "blue", tone: "good" }]] });
  assert.deepEqual(lines, ["- Save button: grey → blue"]);
});

test("a new element and a two-column row read naturally", () => {
  assert.deepEqual(beforeAfterLines({ rows: [["usage report"]] }), ["- New: usage report"]);
  assert.deepEqual(beforeAfterLines({ rows: [["grey", "blue"]] }), ["- grey → blue"]);
});

test("long tables are capped and the rest is counted", () => {
  const rows = Array.from({ length: 7 }, (_, i) => [`case ${i}`, "a", "b"]);
  const lines = beforeAfterLines({ rows }, 5);
  assert.equal(lines.length, 6);
  assert.equal(lines.at(-1), "+2 more in the Artifact");
});

test("no table gives no lines", () => {
  assert.deepEqual(beforeAfterLines(null), []);
});

test("the light comment carries summary, before/after, PR and branch", () => {
  const text = lightComment({ summary: "CI is waited on <b>once</b>.", lines: ["- Change: polls → one wait"], pr: "https://github.com/o/r/compare/dev...b", branch: "worktree-core-1-x" });
  assert.equal(
    text,
    ["CI is waited on once.", "", "Before → after:", "- Change: polls → one wait", "", "PR: https://github.com/o/r/compare/dev...b", "Branch: `worktree-core-1-x`"].join("\n")
  );
});

test("renders are free twice, then warned about", () => {
  assert.equal(renderWarning(1), null);
  assert.equal(renderWarning(2), null);
  assert.match(renderWarning(3), /render #3/);
});
