import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptanceCriteria, overallState, pendingItems, postResult, resultRows } from "./board-verify.mjs";

const config = { apiUrl: "https://api.example/", agentToken: "tok" };

test("acceptance criteria: one per bullet, markers stripped", () => {
  assert.deepEqual(acceptanceCriteria("- [ ] First\n* [x] Second\n3. Third\n\nplain line"), ["First", "Second", "Third", "plain line"]);
  assert.deepEqual(acceptanceCriteria(null), []);
});

test("result rows carry the checks and a pass or fail per criterion", () => {
  const ok = [{ name: "Full test suite", ok: true }, { name: "smoke", ok: true }];
  assert.deepEqual(resultRows("- A\n- B", ok), [
    { ac: "A", test: "Full test suite + smoke", status: "pass" },
    { ac: "B", test: "Full test suite + smoke", status: "pass" },
  ]);
  const red = [{ name: "Full test suite", ok: false }];
  assert.equal(resultRows("", red)[0].status, "fail");
  assert.equal(resultRows("", red)[0].ac, "Ticket checks");
  assert.equal(overallState(red), "fail");
  assert.equal(overallState(ok), "pass");
});

test("only pending tickets are picked up, with the agent token", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, headers: init.headers };
    return { ok: true, status: 200, json: async () => ({ items: [{ key: "CORE-1", verify_state: "pending" }, { key: "CORE-2", verify_state: "pass" }] }) };
  };
  const items = await pendingItems({ config, fetchImpl });
  assert.deepEqual(items.map((i) => i.key), ["CORE-1"]);
  assert.equal(seen.url, "https://api.example/api/v1/platform/work/items?status=verifying");
  assert.equal(seen.headers["X-Agent-Token"], "tok");
});

test("a board API without the verifying status yields no work; other errors throw", async () => {
  const unknown = async () => ({ ok: false, status: 400, json: async () => ({ error: "unknown status" }) });
  assert.deepEqual(await pendingItems({ config, fetchImpl: unknown }), []);

  const boom = async () => ({ ok: false, status: 500, json: async () => ({ error: "x" }) });
  await assert.rejects(pendingItems({ config, fetchImpl: boom }), /500/);

  const otherBadRequest = async () => ({ ok: false, status: 400, json: async () => ({ error: "bad token" }) });
  await assert.rejects(pendingItems({ config, fetchImpl: otherBadRequest }), /400/);
});

test("posts the result; a 409 is skipped, other errors throw", async () => {
  const item = { key: "CORE-1", done_when: "- A" };
  const checks = [{ name: "tests", ok: true }];
  let body;
  const okFetch = async (url, init) => {
    body = JSON.parse(init.body);
    assert.ok(url.endsWith("/items/CORE-1/verify-result"));
    return { ok: true, status: 200, json: async () => ({ item }) };
  };
  await postResult({ item, state: "pass", runUrl: "https://ci/1", checks, config, fetchImpl: okFetch });
  assert.deepEqual(body, { state: "pass", run_url: "https://ci/1", results: [{ ac: "A", test: "tests", status: "pass" }] });

  const conflict = async () => ({ ok: false, status: 409, json: async () => ({}) });
  assert.deepEqual(await postResult({ item, state: "pass", runUrl: "https://ci/1", checks, config, fetchImpl: conflict }), { skipped: true });

  const boom = async () => ({ ok: false, status: 500, json: async () => ({ error: "x" }) });
  await assert.rejects(postResult({ item, state: "pass", runUrl: "https://ci/1", checks, config, fetchImpl: boom }), /500/);
});
