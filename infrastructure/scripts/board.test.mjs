import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_LIMIT,
  backlogPicks,
  cardUrl,
  parseArgs,
  parseReviewAnswers,
  parseTicketBody,
  picksReminder,
  reviewReminder,
  run,
  teamsFileWith,
  ticketProblems,
  waitingForReview,
} from "./board.mjs";

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

test("create --later asks for Backlog and skips the rename hint (CORE-223)", async () => {
  const { calls, impl } = fakeFetch({ item: { key: "CORE-9", status: "backlog", branch: null } });
  const out = [];
  await run(["create", "--team", "CORE", "--title", "For later", "--body", GOOD, "--later"], { config: CONFIG, fetchImpl: impl, log: (l) => out.push(l) });
  assert.equal(calls[0].body.status, "backlog");
  assert.deepEqual(out, ["CORE-9 https://pwa.test/platform/board?item=CORE-9"]);
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

test("link --state reports how a CI run ended", async () => {
  const { calls, impl } = fakeFetch();
  await run(["link", "CORE-9", "--kind", "ci", "--url", "https://github.com/x/y/actions/runs/1", "--state", "passed"], { config: CONFIG, fetchImpl: impl, log: () => {} });
  assert.deepEqual(calls[0].body, { add_links: [{ kind: "ci", url: "https://github.com/x/y/actions/runs/1", state: "passed" }] });
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

// Session-start reminder about a full "Waiting for you" group (CORE-233).
const NOW = Date.parse("2026-11-17T12:00:00Z");
const waited = (key, days, extra = {}) => ({
  key,
  title: `Title of ${key}`,
  status: "needs_review",
  labels: [],
  git_state: "none",
  status_changed_at: new Date(NOW - days * 86_400_000).toISOString(),
  ...extra,
});
const old = (count) => Array.from({ length: count }, (_, i) => waited(`CORE-${i + 1}`, 8 + i));

test("waiting for review = Needs Review, not merged or on hold, the longest wait first", () => {
  const items = [
    waited("CORE-1", 2),
    waited("CORE-2", 9, { git_state: "dev" }),
    waited("CORE-3", 12, { git_state: "prod", labels: ["hold"] }),
    waited("CORE-4", 30, { status: "building" }),
    waited("CORE-5", 9, { git_state: null }),
  ];
  assert.deepEqual(
    waitingForReview(items, NOW).map((i) => [i.key, i.days]),
    [["CORE-3", 12], ["CORE-5", 9], ["CORE-1", 2]],
  );
});

test("the reminder fires above the limit of tickets older than 7 days", () => {
  const line = reviewReminder(old(REVIEW_LIMIT + 1), NOW);
  assert.match(line, /6 tickets have waited for Łukasz's review for more than 7 days/);
  assert.match(line, /CORE-6 \(13 d\), CORE-5 \(12 d\)/);
  assert.match(line, /before creating a new ticket/);
});

test("the reminder stays silent at the limit, and a ticket of exactly 7 days does not count", () => {
  assert.equal(reviewReminder(old(REVIEW_LIMIT), NOW), null);
  assert.equal(reviewReminder([...old(REVIEW_LIMIT), waited("CORE-90", 7)], NOW), null);
  assert.equal(reviewReminder([...old(REVIEW_LIMIT), waited("CORE-91", 20, { git_state: "dev" })], NOW), null);
});

test("waiting lists the group; --remind prints the reminder or nothing", async () => {
  const many = fakeFetch({ items: old(REVIEW_LIMIT + 1) });
  const lines = [];
  await run(["waiting"], { config: CONFIG, fetchImpl: many.impl, log: (l) => lines.push(l), now: NOW });
  assert.match(many.calls[0].url, /\/items\?status=needs_review$/);
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^CORE-6\s+13 d\s+Title of CORE-6$/);

  const reminded = [];
  await run(["waiting", "--remind"], { config: CONFIG, fetchImpl: many.impl, log: (l) => reminded.push(l), now: NOW });
  assert.equal(reminded.length, 1);
  assert.match(reminded[0], /^6 tickets have waited/);

  const quiet = [];
  await run(["waiting", "--remind"], { config: CONFIG, fetchImpl: fakeFetch({ items: old(2) }).impl, log: (l) => quiet.push(l), now: NOW });
  assert.deepEqual(quiet, []);
});

// Monday picks and the backlog review (CORE-234). NOW is a Tuesday.
const MONDAY = NOW - 86_400_000;
const backlog = (key, priority, extra = {}) => ({
  key,
  title: `Title of ${key}`,
  status: "backlog",
  priority,
  done_when: "- It works",
  labels: [],
  created_at: "2026-10-01T00:00:00Z",
  ...extra,
});
const approved = (count) => Array.from({ length: count }, (_, i) => backlog(`NEO-${i + 1}`, 2, { status: "approved" }));

test("picks = Backlog with a priority and a Done when, not set aside; urgent first, then the oldest", () => {
  const items = [
    backlog("CORE-1", 3),
    backlog("CORE-2", 1, { created_at: "2026-10-05T00:00:00Z" }),
    backlog("CORE-3", 1, { created_at: "2026-10-02T00:00:00Z" }),
    backlog("CORE-4", 0),
    backlog("CORE-5", 2, { done_when: " " }),
    backlog("CORE-6", 2, { done_when: null }),
    backlog("CORE-7", 1, { labels: ["Later"] }),
    backlog("CORE-8", 1, { labels: ["hold"] }),
    backlog("CORE-9", 1, { labels: ["ux", "blocked"] }),
    backlog("CORE-10", 1, { status: "approved" }),
  ];
  assert.deepEqual(backlogPicks(items).map((i) => i.key), ["CORE-3", "CORE-2", "CORE-1"]);
});

test("the picks reminder fires on a Monday with fewer than 3 in Approved and offers at most five", () => {
  const ready = Array.from({ length: 7 }, (_, i) => backlog(`CORE-${i + 1}`, i < 2 ? 1 : 2, { created_at: `2026-10-0${i + 1}T00:00:00Z` }));
  const line = picksReminder([...approved(2), ...ready], MONDAY);
  assert.match(line, /^Approved holds 2 tickets\./);
  assert.match(line, /CORE-1 \(P1\), CORE-2 \(P1\), CORE-3 \(P2\), CORE-4 \(P2\), CORE-5 \(P2\)\.$/);
  assert.match(line, /decision form/);
  assert.match(picksReminder(ready, MONDAY), /^Approved holds 0 tickets\./);
  assert.match(picksReminder([...approved(1), ...ready], MONDAY), /^Approved holds 1 ticket\./);
});

test("the picks reminder stays silent on other days, with enough in Approved, or with nothing to offer", () => {
  const ready = [backlog("CORE-1", 1)];
  assert.equal(picksReminder([...approved(2), ...ready], NOW), null);
  assert.equal(picksReminder([...approved(3), ...ready], MONDAY), null);
  assert.equal(picksReminder([...approved(1), backlog("CORE-2", 0)], MONDAY), null);
});

test("picks lists the candidates; --remind prints the reminder or nothing", async () => {
  const board = fakeFetch({ items: [backlog("CORE-1", 2), backlog("CORE-2", 1), backlog("CORE-3", 0)] });
  const lines = [];
  await run(["picks"], { config: CONFIG, fetchImpl: board.impl, log: (l) => lines.push(l), now: NOW });
  assert.match(board.calls[0].url, /\/items\?status=backlog,approved$/);
  assert.deepEqual(lines, ["CORE-2\tP1\tTitle of CORE-2", "CORE-1\tP2\tTitle of CORE-1"]);

  const reminded = [];
  await run(["picks", "--remind"], { config: CONFIG, fetchImpl: board.impl, log: (l) => reminded.push(l), now: MONDAY });
  assert.equal(reminded.length, 1);
  assert.match(reminded[0], /^Approved holds 0 tickets/);

  const quiet = [];
  await run(["picks", "--remind"], { config: CONFIG, fetchImpl: board.impl, log: (l) => quiet.push(l), now: NOW });
  assert.deepEqual(quiet, []);
});

test("review answers are KEY=decision pairs", () => {
  assert.deepEqual(parseReviewAnswers(["core-1=keep", "NEO-2=shipped"]), [
    { key: "CORE-1", decision: "keep" },
    { key: "NEO-2", decision: "shipped" },
  ]);
  for (const bad of ["CORE-1", "CORE-1=done", "CORE=keep", "CORE-1=keep=later"]) {
    assert.throws(() => parseReviewAnswers([bad]), /is not KEY=keep\|later\|cancel\|shipped/);
  }
});

test("review sends the form's answers and prints what was applied and skipped", async () => {
  const board = fakeFetch({ applied: [{ key: "CORE-1", decision: "cancel" }], skipped: [{ key: "NEO-2", reason: "not on prod" }] });
  const lines = [];
  await run(["review", "--form", "board-upkeep-r1", "CORE-1=cancel", "neo-2=shipped"], { config: CONFIG, fetchImpl: board.impl, log: (l) => lines.push(l) });
  assert.match(board.calls[0].url, /\/backlog-review$/);
  assert.equal(board.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(board.calls[0].init.body), {
    form: "board-upkeep-r1",
    decisions: [{ key: "CORE-1", decision: "cancel" }, { key: "NEO-2", decision: "shipped" }],
  });
  assert.deepEqual(lines, ["CORE-1\tcancel", "NEO-2\tskipped: not on prod"]);
});

test("review --confirm names the second form that repeated the cancels", async () => {
  const board = fakeFetch({ applied: [{ key: "CORE-1", decision: "cancel" }], skipped: [] });
  await run(["review", "--form", "r1", "--confirm", "r1-cancels", "CORE-1=cancel"], { config: CONFIG, fetchImpl: board.impl, log: () => {} });
  assert.deepEqual(JSON.parse(board.calls[0].init.body), { form: "r1", confirm: "r1-cancels", decisions: [{ key: "CORE-1", decision: "cancel" }] });
});

test("review refuses to run without a form id or without answers", async () => {
  const board = fakeFetch();
  await assert.rejects(run(["review", "CORE-1=keep"], { config: CONFIG, fetchImpl: board.impl, log: () => {} }), /--form/);
  await assert.rejects(run(["review", "--form", "r1"], { config: CONFIG, fetchImpl: board.impl, log: () => {} }), /missing the answers/);
  assert.equal(board.calls.length, 0);
});
