import { test } from "node:test";
import assert from "node:assert/strict";
import { cardUrl, parseArgs, parseTicketBody, run, teamsFileWith, ticketProblems } from "./board.mjs";

const GOOD = "## Problem\nThe board is stale.\n\n## Change\n- Sessions write here\n\n## Done when\n- A test proves it";
const CONFIG = { apiUrl: "https://api.test", token: "nbs_x", boardUrl: "https://pwa.test/platform/board" };

function fakeFetch(answer = { item: { key: "CORE-9", status: "building", branch: null } }, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    return { ok: status < 400, status, json: async () => answer };
  };
  return { calls, impl };
}

test("parses the three ticket sections", () => {
  assert.deepEqual(parseTicketBody(GOOD), {
    problem: "The board is stale.",
    change: "- Sessions write here",
    done_when: "- A test proves it",
  });
});

test("accepts a well-formed ticket", () => {
  assert.deepEqual(ticketProblems(GOOD), []);
});

test("rejects a missing heading, an empty section and a long body", () => {
  assert.match(ticketProblems("## Problem\nx\n## Change\ny").join(), /Done when/);
  assert.match(ticketProblems("## Problem\n\n## Change\ny\n## Done when\nz").join(), /'## Problem' is empty/);
  assert.match(ticketProblems(`## Problem\n${"x".repeat(1501)}\n## Change\ny\n## Done when\nz`).join(), /max 1500/);
  assert.deepEqual(ticketProblems(""), ["the body is empty"]);
});

test("parses flags and positionals", () => {
  assert.deepEqual(parseArgs(["CORE-1", "--kind", "pr", "--write"]), { flags: { kind: "pr", write: true }, positional: ["CORE-1"] });
});

test("builds the card link from the board URL", () => {
  assert.equal(cardUrl("core-12", CONFIG), "https://pwa.test/platform/board?item=CORE-12");
});

test("create sends the sections with the session token and prints key + link", async () => {
  const { calls, impl } = fakeFetch();
  const out = [];
  await run(["create", "--team", "core", "--title", "Board first", "--body", GOOD], { config: CONFIG, fetchImpl: impl, log: (l) => out.push(l) });
  assert.equal(calls[0].url, "https://api.test/api/v1/platform/work/items");
  assert.equal(calls[0].init.headers["X-Session-Token"], "nbs_x");
  assert.deepEqual(calls[0].body, { team: "CORE", title: "Board first", ...parseTicketBody(GOOD) });
  assert.equal(out[0], "CORE-9 https://pwa.test/platform/board?item=CORE-9");
});

test("create refuses a bad ticket before calling the API", async () => {
  const { calls, impl } = fakeFetch();
  await assert.rejects(run(["create", "--team", "CORE", "--title", "x", "--body", "## Problem\nx"], { config: CONFIG, fetchImpl: impl, log: () => {} }), /NEO-84/);
  assert.equal(calls.length, 0);
});

test("move, link and branch patch the item", async () => {
  const { calls, impl } = fakeFetch();
  const opts = { config: CONFIG, fetchImpl: impl, log: () => {} };
  await run(["move", "CORE-9", "needs_review"], opts);
  await run(["link", "CORE-9", "--kind", "artifact", "--url", "https://claude.ai/artifact/a"], opts);
  await run(["branch", "CORE-9", "worktree-core-9-x"], opts);
  assert.deepEqual(calls.map((c) => [c.init.method, c.body]), [
    ["PATCH", { status: "needs_review" }],
    ["PATCH", { add_links: [{ kind: "artifact", url: "https://claude.ai/artifact/a" }] }],
    ["PATCH", { branch: "worktree-core-9-x" }],
  ]);
});

test("surfaces the API's refusal", async () => {
  const { impl } = fakeFetch({ error: "The session cannot move needs_review to done" }, 403);
  await assert.rejects(run(["move", "CORE-9", "done"], { config: CONFIG, fetchImpl: impl, log: () => {} }), /403: The session cannot move/);
});

test("says how to configure when there is no token", async () => {
  await assert.rejects(run(["get", "CORE-1"], { config: { ...CONFIG, token: "" }, fetchImpl: fakeFetch().impl, log: () => {} }), /Session tokens/);
});

test("rewrites the team keys and keeps the comment header", () => {
  assert.equal(teamsFileWith("# header\n# more\nNEO\nCORE\n", ["CORE", "NEO", "AJM"]), "# header\n# more\nCORE\nNEO\nAJM\n");
});
