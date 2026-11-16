import { test } from "node:test";
import assert from "node:assert/strict";
import { handoffPlan, tellBoard } from "./ci-failure-handoff.mjs";

test("a worker branch still in building goes back to approved for CI-fix mode", () => {
  assert.deepEqual(handoffPlan({ branch: "worker/core-12-x", status: "building", exhausted: false }), { comment: true, move: "approved" });
});

test("used-up attempts hand a building ticket to needs_review", () => {
  assert.deepEqual(handoffPlan({ branch: "worker/core-12-x", status: "building", exhausted: true }), { comment: true, move: "needs_review" });
});

test("a session branch only gets the comment: the live session fixes it (quality-gate.sh)", () => {
  assert.deepEqual(handoffPlan({ branch: "worktree-core-12-x", status: "building", exhausted: false }), { comment: true, move: null });
});

test("a ticket outside building is not moved (the agent token may not)", () => {
  assert.deepEqual(handoffPlan({ branch: "worker/neo-3-x", status: "needs_review", exhausted: false }), { comment: true, move: null });
});

test("tellBoard comments with the agent token, then moves", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, header: init.headers["X-Agent-Token"], body: init.body && JSON.parse(init.body) });
    if (init.method === "GET") return new Response(JSON.stringify({ item: { key: "CORE-12", status: "building" } }), { status: 200 });
    return new Response(JSON.stringify({ item: { key: "CORE-12", status: "approved" }, event: {} }), { status: 200 });
  };
  const out = await tellBoard({ ticket: "CORE-12", branch: "worker/core-12-x", body: "red", exhausted: false, config: { apiUrl: "https://api.test", agentToken: "t" }, fetchImpl });
  assert.equal(out, "CORE-12: commented, → approved");
  assert.deepEqual(
    calls.map((c) => [c.method, c.url.replace("https://api.test/api/v1/platform/work", ""), c.header]),
    [
      ["GET", "/items/CORE-12", "t"],
      ["POST", "/items/CORE-12/comments", "t"],
      ["PATCH", "/items/CORE-12", "t"],
    ]
  );
  assert.deepEqual(calls[2].body, { status: "approved" });
});
