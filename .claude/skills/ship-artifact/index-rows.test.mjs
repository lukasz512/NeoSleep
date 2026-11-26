// node --test .claude/skills/ship-artifact/index-rows.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { BATCH_SIZE, COLLECTION, docId, importBatches, toRow } from "./index-rows.mjs";

const entry = (n, extra = {}) => ({ ticket: `CORE-${n}`, title: `t${n}`, headline: "h", status: "Needs Review", updated: "2026-10-07T00:00:00Z", branch: `worktree-core-${n}-x`, artifact: "https://claude.ai/artifact/a", linear: "https://linear.app/x", vscode: "vscode://x", pr: null, ...extra });

test("doc id is the ticket, so a re-ship upserts the same row", () => {
  assert.equal(docId(entry(105)), "CORE-105");
});

test("ticketless change falls back to a path-safe branch id", () => {
  assert.equal(docId({ ticket: null, branch: "feat/some thing" }), "feat-some-thing");
  assert.throws(() => docId({ ticket: null, branch: "" }));
});

test("row keeps only the known fields, missing ones as null", () => {
  const row = toRow({ ...entry(1), secret: "x", pr: undefined });
  assert.equal(row.secret, undefined);
  assert.equal(row.pr, null);
  assert.deepEqual(Object.keys(row), ["ticket", "title", "headline", "status", "updated", "branch", "artifact", "linear", "vscode", "pr"]);
});

test("import splits into batches of at most 50 set writes", () => {
  const entries = Array.from({ length: 189 }, (_, i) => entry(i));
  const batches = importBatches(entries, (e) => `/rows/${e.ticket}.json`);
  assert.deepEqual(batches.map((b) => b.length), [BATCH_SIZE, BATCH_SIZE, BATCH_SIZE, 39]);
  assert.deepEqual(batches[0][0], { op: "set", collection: COLLECTION, doc_id: "CORE-0", file_path: "/rows/CORE-0.json" });
});
