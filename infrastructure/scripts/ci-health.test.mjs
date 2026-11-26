// node --test — ci-health.mjs (CORE-58).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiFailures, greenStreak, healthMarkdown, signals, tellBoard, withRequiredChecks, GREEN_TARGET, NIGHTS_TARGET, TICKETS } from "./ci-health.mjs";

const run = (conclusion, id = 1) => ({ id, conclusion, html_url: `https://github.test/runs/${id}` });
const greens = (n) => Array.from({ length: n }, (_, i) => run("success", 100 + i));

test("green streak: successes since the newest failure; cancelled and skipped runs neither count nor break it", () => {
  assert.equal(greenStreak([run("success"), run("cancelled"), run("success"), run("skipped"), run("failure"), run("success")]), 2);
  assert.equal(greenStreak([run("failure"), run("success")]), 0);
  assert.equal(greenStreak([run("timed_out"), run("success")]), 0);
  assert.equal(greenStreak([]), 0);
});

test("API failures: only runs whose failed step is the API test step", () => {
  const jobs = (step) => [{ name: "test", conclusion: "failure", steps: [{ name: "Lint (all workspaces)", conclusion: "success" }, { name: step, conclusion: "failure" }] }];
  const failed = [
    { ...run("failure", 7), jobs: jobs("Test — api (blocking)") },
    { ...run("failure", 8), jobs: jobs("Test — pwa e2e (blocking)") },
  ];
  assert.deepEqual(apiFailures(failed), [{ id: 7, url: "https://github.test/runs/7" }]);
});

test("ruleset change: adds only the missing checks and keeps every other rule", () => {
  const ruleset = {
    id: 19004636,
    name: "requiere_PR_to_merge",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["refs/heads/dev"], exclude: [] } },
    bypass_actors: [],
    node_id: "x",
    rules: [{ type: "deletion" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "test", integration_id: 15368 }] } }],
  };
  const { missing, body } = withRequiredChecks(ruleset, ["test", "tooling", "api-image"]);
  assert.deepEqual(missing, ["tooling", "api-image"]);
  assert.deepEqual(Object.keys(body).sort(), ["bypass_actors", "conditions", "enforcement", "name", "rules", "target"]);
  assert.deepEqual(body.rules[0], { type: "deletion" });
  assert.deepEqual(body.rules[1].parameters.required_status_checks, [
    { context: "test", integration_id: 15368 },
    { context: "tooling", integration_id: 15368 },
    { context: "api-image", integration_id: 15368 },
  ]);
  assert.equal(body.rules[1].parameters.strict_required_status_checks_policy, false);
  assert.deepEqual(withRequiredChecks({ ...ruleset, rules: body.rules }, ["tooling", "api-image"]).missing, []);
});

test("signals: 10 green runs with checks still optional tells CORE-63 how to make them required", () => {
  const [signal] = signals({ runs: greens(GREEN_TARGET), required: ["test"], apiFailed: [], latestNights: 0 });
  assert.equal(signal.ticket, TICKETS.required);
  assert.match(signal.body, /10 CI runs in a row on dev are green/);
  assert.match(signal.body, /tooling, api-image/);
  assert.match(signal.body, /ci-health\.mjs --require/);
  assert.match(signal.body, /github\.test\/runs\/100/);
});

test("signals: nothing below the target, nothing once the checks are required, nothing while the rules are unknown", () => {
  assert.deepEqual(signals({ runs: greens(GREEN_TARGET - 1), required: ["test"], apiFailed: [], latestNights: 0 }), []);
  assert.deepEqual(signals({ runs: greens(GREEN_TARGET), required: ["test", "tooling", "api-image"], apiFailed: [], latestNights: 0 }), []);
  assert.deepEqual(signals({ runs: greens(GREEN_TARGET), required: null, apiFailed: [], latestNights: 0 }), []);
});

test("signals: a failed API test step tells CORE-35, one comment per newest failing run", () => {
  const [signal] = signals({ runs: [], required: ["test"], apiFailed: [{ id: 7, url: "https://github.test/runs/7" }, { id: 5, url: "https://github.test/runs/5" }], latestNights: 0 });
  assert.equal(signal.ticket, TICKETS.api);
  assert.match(signal.marker, /api:7/);
  assert.match(signal.body, /2 dev CI runs/);
  assert.match(signal.body, /runs\/7[\s\S]*runs\/5/);
});

test("signals: the newer runner image green 3 nights in a row tells the pin ticket", () => {
  assert.deepEqual(signals({ runs: [], required: ["test"], apiFailed: [], latestNights: NIGHTS_TARGET - 1 }), []);
  const [signal] = signals({ runs: [], required: ["test"], apiFailed: [], latestNights: NIGHTS_TARGET });
  assert.equal(signal.ticket, TICKETS.pin);
  assert.match(signal.body, /runs-on: ubuntu-latest/);
});

test("the board hears each signal once: a ticket that already carries the marker gets no second comment", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(`${init.method} ${url.replace("https://api.test/api/v1/platform/work", "")}`);
    assert.equal(init.headers["X-Agent-Token"], "token");
    if (init.method === "GET") {
      const told = url.endsWith("/CORE-63");
      return { ok: true, status: 200, json: async () => ({ item: {}, events: told ? [{ kind: "comment", body: "old\n<!-- ci-health:required -->" }] : [] }) };
    }
    assert.match(JSON.parse(init.body).body, /<!-- ci-health:api:7 -->$/);
    return { ok: true, status: 201, json: async () => ({}) };
  };
  const out = await tellBoard({
    signals: [
      { ticket: "CORE-63", marker: "<!-- ci-health:required -->", body: "again" },
      { ticket: "CORE-35", marker: "<!-- ci-health:api:7 -->", body: "API tests failed" },
    ],
    config: { apiUrl: "https://api.test/", agentToken: "token" },
    fetchImpl,
  });
  assert.deepEqual(calls, ["GET /items/CORE-63", "GET /items/CORE-35", "POST /items/CORE-35/comments"]);
  assert.deepEqual(out, ["CORE-63: already told", "CORE-35: commented"]);
});

test("the summary names the streak, the API failures and the newer image", () => {
  const md = healthMarkdown({ runs: [run("success"), run("failure")], required: ["test"], apiFailed: [], latestNights: 1 });
  assert.match(md, /Green in a row on dev: 1 \(target 10\)/);
  assert.match(md, /Required checks on dev: test/);
  assert.match(md, /API test step failed in the last 24 h: 0 runs/);
  assert.match(md, /green 1 night\(s\) in a row \(target 3\)/);
});
