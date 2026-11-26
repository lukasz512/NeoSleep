import { test } from "node:test";
import assert from "node:assert/strict";
import { branchKeys, citedKeys, gitStates, parseLog, report } from "./board-git-state.mjs";

const TEAMS = ["NEO", "CORE"];
/** One `git log --format=%H%x1f%s%x1f%b%x1e` record. */
const commit = (sha, subject, body = "") => `${sha}\x1f${subject}\x1f${body}\x1e\n`;

test("parses git log records, newest first", () => {
  const log = commit("aaa", "feat: one (CORE-1)", "line\n\nCORE-1") + commit("bbb", "chore: two");
  assert.deepEqual(parseLog(log), [
    { sha: "aaa", text: "feat: one (CORE-1)\nline\n\nCORE-1" },
    { sha: "bbb", text: "chore: two\n" },
  ]);
  assert.deepEqual(parseLog(""), []);
});

test("finds keys in the subject, the body and a merge commit's branch name", () => {
  assert.deepEqual(citedKeys("fix(api): keep the header out (CORE-213)", TEAMS), ["CORE-213"]);
  assert.deepEqual(citedKeys("Merge pull request #528 from lukasz512/worktree-core-213-wire-scaffold-tables\nNEO-7 too", TEAMS), ["CORE-213", "NEO-7"]);
});

test("ignores other teams, longer words and repeats", () => {
  assert.deepEqual(citedKeys("AJM-4 ENCORE-12 SCORE-9 core-5 CORE-5 xneo-3", TEAMS), ["CORE-5"]);
});

test("a ticket cited only on dev is on dev", () => {
  const dev = commit("d2", "feat: board (CORE-221)") + commit("d1", "feat: old (NEO-1)");
  const prod = commit("d1", "feat: old (NEO-1)");
  assert.deepEqual(gitStates({ dev, prod, teams: TEAMS }), [
    { key: "CORE-221", state: "dev", sha: "d2" },
    { key: "NEO-1", state: "prod", sha: "d1" },
  ]);
});

test("a ticket with a newer commit on dev than on prod is back on dev", () => {
  const dev = commit("d3", "fix: follow-up (NEO-1)") + commit("d1", "feat: old (NEO-1)");
  const prod = commit("d1", "feat: old (NEO-1)");
  assert.deepEqual(gitStates({ dev, prod, teams: TEAMS }), [{ key: "NEO-1", state: "dev", sha: "d3" }]);
});

test("a ticket cited only on prod (hotfix) is on prod", () => {
  const prod = commit("p1", "fix: hotfix (CORE-9)");
  assert.deepEqual(gitStates({ dev: "", prod, teams: TEAMS }), [{ key: "CORE-9", state: "prod", sha: "p1" }]);
});

function fakeFetch(answer = { updated: 2, closed: [] }, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => answer };
  };
  return { calls, impl };
}
const CONFIG = { apiUrl: "https://api.test/", agentToken: "agent_x" };
const ITEMS = [{ key: "CORE-1", state: "dev", sha: "d1" }];

test("reports a complete snapshot with the agent token", async () => {
  const { calls, impl } = fakeFetch();
  await report({ items: ITEMS, config: CONFIG, fetchImpl: impl });
  assert.equal(calls[0].url, "https://api.test/api/v1/platform/work/git-state");
  assert.equal(calls[0].headers["X-Agent-Token"], "agent_x");
  assert.deepEqual(calls[0].body, { items: ITEMS, complete: true, tidy: { branches: [] } });
});

test("lists the keys cited by remote branch names, without dev and prod", () => {
  const refs = "origin\norigin/dev\norigin/prod\norigin/worktree-core-58-stable-ci\norigin/worktree-neo-133-notifications-epic-docs\norigin/renovate/vite-7.x\norigin/worktree-core-58-second\n";
  assert.deepEqual(branchKeys(refs, TEAMS), ["CORE-58", "NEO-133"]);
  assert.deepEqual(branchKeys("", TEAMS), []);
});

test("sends the branch keys so the board can tidy Building (CORE-223)", async () => {
  const { calls, impl } = fakeFetch();
  await report({ items: ITEMS, branches: ["CORE-58"], config: CONFIG, fetchImpl: impl });
  assert.deepEqual(calls[0].body.tidy, { branches: ["CORE-58"] });
});

test("asks the board to close only when told the prod smoke test passed", async () => {
  const { calls, impl } = fakeFetch();
  await report({ items: ITEMS, close: { smoke_url: "https://github.test/run/1" }, config: CONFIG, fetchImpl: impl });
  assert.deepEqual(calls[0].body.close, { smoke_url: "https://github.test/run/1" });
});

test("a refused report throws with the API's reason", async () => {
  const { impl } = fakeFetch({ error: "forbidden" }, 403);
  await assert.rejects(report({ items: ITEMS, config: CONFIG, fetchImpl: impl }), /403: forbidden/);
});

test("an API without the route yet is not an error", async () => {
  const { impl } = fakeFetch({ error: "Not found" }, 404);
  assert.equal(await report({ items: ITEMS, config: CONFIG, fetchImpl: impl }), null);
});
